// src/core/notification/services/notification.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, In, IsNull, Not } from 'typeorm';
import { User, NotificationQueue } from '../../../models';
import { getConfig } from '../../../security/config';
import { UserService } from '../../user/services';
import {
  NotificationTypeEnum,
  NotificationStatusEnum,
  NotificationDetails,
} from '../../../models/NotificationQueue';
import { FarcasterNotificationResponse } from './notification.types';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
  private readonly config = getConfig();
  private rateLimitTracker = new Map<string, number[]>();
  private isProcessing = false;
  private lastProcessingTime = 0;

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,

    @InjectRepository(NotificationQueue)
    private readonly queueRepository: Repository<NotificationQueue>,

    private readonly userService: UserService,
  ) {}

  /**
   * Handles when a user adds the frame to their profile
   * Sends welcome notification and enables notifications
   */
  async handleFrameAdded(
    fid: number,
    notificationDetails?: NotificationDetails,
  ): Promise<void> {
    try {
      this.logger.log(`Frame added for FID: ${fid}`);

      const user = await this.userRepository.findOne({
        where: { fid },
      });

      if (!user) {
        this.logger.warn(`User not found for FID: ${fid}`);
        return;
      }

      // Enable notifications if details provided
      if (notificationDetails) {
        user.notificationsEnabled = true;
        user.notificationToken = notificationDetails.token;
        user.notificationUrl = notificationDetails.url;
        await this.userRepository.save(user);
        this.logger.log(`Notifications enabled for user ${user.fid}`);
      }

      // Send welcome notification
      await this.sendWelcomeNotification(fid);
    } catch (error) {
      this.logger.error(`Error handling frame added for ${fid}:`, error);
    }
  }

  /**
   * Handles when a user removes the frame from their profile
   * Disables notifications for the user
   */
  async handleFrameRemoved(fid: number): Promise<void> {
    try {
      this.logger.log(`Frame removed for FID: ${fid}`);

      const user = await this.userRepository.findOne({
        where: { fid },
      });

      if (!user) {
        this.logger.warn(`User not found for FID: ${fid}`);
        return;
      }

      // Disable notifications
      user.notificationsEnabled = false;
      user.notificationToken = null;
      user.notificationUrl = null;
      await this.userRepository.save(user);

      this.logger.log(`Notifications disabled for user ${user.fid}`);
    } catch (error) {
      this.logger.error(`Error handling frame removed for ${fid}:`, error);
    }
  }

  /**
   * Handles when a user enables notifications
   * Updates user notification settings
   */
  async handleNotificationsEnabled(
    fid: number,
    notificationDetails: NotificationDetails,
  ): Promise<void> {
    try {
      this.logger.log(`Notifications enabled for FID: ${fid}`);

      const user = await this.userRepository.findOne({
        where: { fid },
      });

      if (!user) {
        this.logger.warn(`User not found for FID: ${fid}`);
        return;
      }

      user.notificationsEnabled = true;
      user.notificationToken = notificationDetails.token;
      user.notificationUrl = notificationDetails.url;
      await this.userRepository.save(user);

      this.logger.log(`Notification settings updated for user ${user.fid}`);
    } catch (error) {
      this.logger.error(`Error enabling notifications for ${fid}:`, error);
    }
  }

  /**
   * Handles when a user disables notifications
   * Updates user notification settings
   */
  async handleNotificationsDisabled(fid: number): Promise<void> {
    try {
      this.logger.log(`Notifications disabled for FID: ${fid}`);

      const user = await this.userRepository.findOne({
        where: { fid },
      });

      if (!user) {
        this.logger.warn(`User not found for FID: ${fid}`);
        return;
      }

      user.notificationsEnabled = false;
      user.notificationToken = null;
      user.notificationUrl = null;
      await this.userRepository.save(user);

      this.logger.log(`Notification settings updated for user ${user.fid}`);
    } catch (error) {
      this.logger.error(`Error disabling notifications for ${fid}:`, error);
    }
  }

  /**
   * Queues a notification for a user
   * Handles idempotency and scheduling
   */
  async queueNotification(
    userId: number,
    type: NotificationTypeEnum,
    title: string,
    body: string,
    targetUrl: string = 'https://sigil.lat',
    scheduledFor: Date = new Date(),
    customIdempotencyKey?: string,
  ): Promise<void> {
    try {
      // Generate idempotency key if not provided
      const idempotencyKey =
        customIdempotencyKey ||
        `${type}_${userId}_${scheduledFor.toISOString().split('T')[0]}`;

      // Check if notification already exists
      const existingNotification = await this.queueRepository.findOne({
        where: { notificationId: idempotencyKey },
      });

      if (existingNotification) {
        this.logger.log(
          `Notification already queued with idempotency key: ${idempotencyKey}`,
        );
        return;
      }

      // Create new notification
      const notification = this.queueRepository.create({
        userId,
        type,
        notificationId: idempotencyKey,
        title,
        body,
        targetUrl,
        scheduledFor,
        status: NotificationStatusEnum.PENDING,
      });

      await this.queueRepository.save(notification);

      this.logger.log(
        `Queued notification for user ${userId}: ${type} - ${title}`,
      );
    } catch (error) {
      this.logger.error(
        `Error queuing notification for user ${userId}:`,
        error,
      );
    }
  }

  /**
   * Processes pending notifications in batches
   * Handles rate limiting and error handling
   */
  async processPendingNotifications(): Promise<void> {
    if (this.isProcessing) {
      this.logger.log('Notification processing already in progress, skipping');
      return;
    }

    if (!this.config.notifications.enabled) {
      this.logger.log('Notifications disabled globally, skipping processing');
      return;
    }

    this.isProcessing = true;

    try {
      const now = new Date();
      const maxRetries = 3;

      // Get pending notifications that are due
      const pendingNotifications = await this.queueRepository.find({
        where: {
          status: NotificationStatusEnum.PENDING,
          scheduledFor: LessThan(now),
          retryCount: LessThan(maxRetries),
        },
        relations: ['user'],
        take: 50, // Process in batches
        order: { scheduledFor: 'ASC' },
      });

      if (pendingNotifications.length === 0) {
        this.logger.log('No pending notifications to process');
        return;
      }

      this.logger.log(
        `Processing ${pendingNotifications.length} pending notifications`,
      );

      // Group notifications by URL for batch processing
      const notificationsByUrl =
        this.groupNotificationsByUrl(pendingNotifications);

      // Handle notifications with null users before processing URL groups
      const nullUserNotifications = pendingNotifications.filter(
        (n) => !n.user || !n.user.notificationUrl,
      );
      if (nullUserNotifications.length > 0) {
        await this.handleNotificationFailures(
          nullUserNotifications,
          'User not found or missing notification URL',
        );
      }

      // Process each URL group
      for (const [url, notifications] of notificationsByUrl) {
        try {
          await this.sendBatchNotifications(url, notifications);
        } catch (error) {
          this.logger.error(
            `Error processing notifications for ${url}:`,
            error,
          );
          await this.handleNotificationFailures(notifications, error.message);
        }
      }

      this.lastProcessingTime = Date.now();
    } catch (error) {
      this.logger.error('Error processing pending notifications:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Sends welcome notification to new users
   */
  async sendWelcomeNotification(fid: number): Promise<void> {
    try {
      const user = await this.userRepository.findOne({
        where: { fid },
      });

      if (!user) {
        this.logger.warn(`User not found for welcome notification: ${fid}`);
        return;
      }

      await this.queueWelcomeNotification(user);
    } catch (error) {
      this.logger.error(
        `Error sending welcome notification for ${fid}:`,
        error,
      );
    }
  }

  /**
   * Verifies webhook signature from Farcaster
   */
  async verifyWebhookSignature(webhookData: any): Promise<boolean> {
    try {
      // Basic validation
      if (!this.validateWebhookStructure(webhookData)) {
        this.logger.warn('Invalid webhook structure');
        return false;
      }

      // Log webhook details for debugging
      this.logWebhookDetails(webhookData);

      // For now, accept all webhooks (you might want to add signature verification)
      return true;
    } catch (error) {
      this.logger.error('Error verifying webhook signature:', error);
      return false;
    }
  }

  /**
   * Validates webhook structure
   */
  private validateWebhookStructure(webhookData: any): boolean {
    return (
      webhookData &&
      typeof webhookData === 'object' &&
      webhookData.type &&
      webhookData.data &&
      webhookData.data.fid
    );
  }

  /**
   * Logs webhook details for debugging
   */
  private logWebhookDetails(webhookData: any): void {
    this.logger.log('Webhook received:', {
      type: webhookData.type,
      fid: webhookData.data?.fid,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Queues daily running reminders for users
   */
  async queueDailyRunningReminders(): Promise<void> {
    try {
      if (!this.config.notifications.enabled) {
        this.logger.log(
          'Notifications disabled globally, skipping daily running reminders',
        );
        return;
      }

      this.logger.log('Processing daily running reminders...');

      const today = new Date().toISOString().split('T')[0];

      // Find users with notifications enabled who haven't received a reminder today
      const usersNeedingReminder = await this.userRepository
        .createQueryBuilder('user')
        .where('user.notificationsEnabled = true')
        .andWhere('user.notificationToken IS NOT NULL')
        .andWhere(
          '(user.lastRunReminderSent IS NULL OR DATE(user.lastRunReminderSent) < :today)',
          { today },
        )
        .getMany();

      if (usersNeedingReminder.length === 0) {
        this.logger.log('No users require daily running reminders');
        return;
      }

      // Queue reminders with unique IDs to prevent duplicates
      for (const user of usersNeedingReminder) {
        await this.queueNotification(
          user.fid,
          NotificationTypeEnum.DAILY_REMINDER,
          '🏃‍♂️ Time to run!',
          'Track your run today and earn points! Keep up your fitness streak!',
          `${this.config.notifications.baseUrl}`,
          new Date(),
          `daily_reminder_${user.fid}_${today}`, // Explicit idempotency key
        );
      }

      // Update reminder tracking to prevent duplicate processing
      await this.userRepository.update(
        usersNeedingReminder.map((u) => u.fid),
        { lastRunReminderSent: new Date() },
      );

      this.logger.log(
        `Queued daily running reminders for ${usersNeedingReminder.length} users`,
      );
    } catch (error) {
      this.logger.error('Error queuing daily running reminders:', error);
    }
  }

  /**
   * Queues evening running reminders for users who haven't tracked a run
   */
  async queueEveningRunningReminders(): Promise<void> {
    try {
      if (!this.config.notifications.enabled) {
        this.logger.log(
          'Notifications disabled globally, skipping evening reminders',
        );
        return;
      }

      this.logger.log('Processing evening running reminders...');

      const today = new Date().toISOString().split('T')[0];

      // Find users who got morning reminder but still haven't tracked a run
      const usersNeedingEvening = await this.userRepository
        .createQueryBuilder('user')
        .where('user.notificationsEnabled = true')
        .andWhere('user.notificationToken IS NOT NULL')
        .andWhere('DATE(user.lastRunReminderSent) = :today', { today }) // Got morning reminder
        .andWhere(
          '(user.lastRunDate IS NULL OR DATE(user.lastRunDate) < :today)',
          { today },
        ) // Haven't tracked run today
        .getMany();

      if (usersNeedingEvening.length === 0) {
        this.logger.log('No users require evening running reminders');
        return;
      }

      // Queue evening reminders with different idempotency key
      for (const user of usersNeedingEvening) {
        await this.queueNotification(
          user.fid,
          NotificationTypeEnum.EVENING_REMINDER,
          '⏰ Last chance to track your run today!',
          "Don't break your fitness streak! Track your run now and earn points.",
          `${this.config.notifications.baseUrl}`,
          new Date(),
          `evening_reminder_${user.fid}_${today}`, // Different key from morning
        );
      }

      this.logger.log(
        `Queued evening reminders for ${usersNeedingEvening.length} users`,
      );
    } catch (error) {
      this.logger.error('Error queuing evening reminders:', error);
    }
  }

  /**
   * Removes old notification records to maintain database performance
   * Keeps 30-day history for debugging while cleaning completed notifications
   */
  async cleanupOldNotifications(): Promise<void> {
    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      const result = await this.queueRepository.delete({
        createdAt: LessThan(thirtyDaysAgo),
        status: In([
          NotificationStatusEnum.SENT,
          NotificationStatusEnum.FAILED,
          NotificationStatusEnum.SKIPPED,
        ]),
      });

      this.logger.log(
        `Cleaned up ${result.affected || 0} old notification records`,
      );
    } catch (error) {
      this.logger.error('Error cleaning up old notifications:', error);
    }
  }

  /**
   * Queues weekly achievement announcements for users
   */
  async queueWeeklyAchievementAnnouncements(): Promise<void> {
    try {
      if (!this.config.notifications.enabled) {
        this.logger.log(
          'Notifications disabled globally, skipping weekly achievement announcements',
        );
        return;
      }

      this.logger.log('Processing weekly achievement announcements...');

      const usersWithNotifications = await this.userRepository.find({
        where: {
          notificationsEnabled: true,
          notificationToken: Not(IsNull()),
        },
        select: ['fid', 'username'],
      });

      if (usersWithNotifications.length === 0) {
        this.logger.log(
          'No users with notifications enabled for achievement announcements',
        );
        return;
      }

      const weekKey = new Date().toISOString().substring(0, 10); // YYYY-MM-DD format

      // Queue achievement announcements with week-specific idempotency
      for (const user of usersWithNotifications) {
        await this.queueNotification(
          user.fid,
          NotificationTypeEnum.WEEKLY_ACHIEVEMENT,
          '🏆 Weekly Running Achievement!',
          "Check out this week's top runners and achievements! Keep pushing your limits!",
          `${this.config.notifications.baseUrl}`,
          new Date(),
          `weekly_achievement_${user.fid}_${weekKey}`, // Week-specific idempotency
        );
      }

      this.logger.log(
        `Queued weekly achievement announcements for ${usersWithNotifications.length} users`,
      );
    } catch (error) {
      this.logger.error(
        'Error queuing weekly achievement announcements:',
        error,
      );
    }
  }

  /**
   * Decodes webhook payload from base64
   */
  decodeWebhookPayload(encodedPayload: string): any {
    try {
      const decoded = Buffer.from(encodedPayload, 'base64').toString('utf-8');
      return JSON.parse(decoded);
    } catch (error) {
      this.logger.error('Error decoding webhook payload:', error);
      return null;
    }
  }

  /**
   * Extracts FID from webhook header
   */
  extractFidFromHeader(encodedHeader: string): number {
    try {
      const decoded = Buffer.from(encodedHeader, 'base64').toString('utf-8');
      const header = JSON.parse(decoded);
      return header.fid;
    } catch (error) {
      this.logger.error('Error extracting FID from header:', error);
      return 0;
    }
  }

  /**
   * Queues welcome notification for new user
   */
  private async queueWelcomeNotification(user: User): Promise<void> {
    await this.queueNotification(
      user.fid,
      NotificationTypeEnum.WELCOME,
      '🎉 Welcome to $runner!',
      'Start tracking your runs and earn points. Join our running community!',
      `${this.config.notifications.baseUrl}`,
      new Date(),
      `welcome_${user.fid}`,
    );
  }

  /**
   * Sends batch notifications to a specific URL
   */
  private async sendBatchNotifications(
    notificationUrl: string,
    notifications: NotificationQueue[],
  ): Promise<void> {
    if (notifications.length === 0) return;

    // Check rate limit
    if (!this.checkRateLimit(notificationUrl, notifications.length)) {
      this.logger.warn(
        `Rate limit exceeded for ${notificationUrl}, marking notifications as skipped`,
      );
      await this.markNotificationsAsSkipped(
        notifications,
        'Rate limit exceeded',
      );
      return;
    }

    const payload = {
      notifications: notifications.map((notification) => ({
        notificationId: notification.notificationId,
        title: notification.title,
        body: notification.body,
        targetUrl: notification.targetUrl,
        token: notification.user.notificationToken,
      })),
    };

    try {
      const response = await fetch(notificationUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result: FarcasterNotificationResponse = await response.json();

      await this.processNotificationResults(notifications, result);
    } catch (error) {
      this.logger.error(
        `Error sending batch notifications to ${notificationUrl}:`,
        error,
      );
      await this.handleNotificationFailures(notifications, error.message);
    }
  }

  /**
   * Checks rate limit for a URL
   */
  private checkRateLimit(url: string, count: number): boolean {
    const now = Date.now();
    const windowMs = 60 * 1000; // 1 minute window
    const maxRequests = 100; // Max requests per minute

    if (!this.rateLimitTracker.has(url)) {
      this.rateLimitTracker.set(url, []);
    }

    const requests = this.rateLimitTracker.get(url)!;
    const recentRequests = requests.filter(
      (timestamp) => now - timestamp < windowMs,
    );

    if (recentRequests.length + count > maxRequests) {
      return false;
    }

    // Add current requests
    for (let i = 0; i < count; i++) {
      recentRequests.push(now);
    }

    this.rateLimitTracker.set(url, recentRequests);
    return true;
  }

  /**
   * Handles notification failures
   */
  private async handleNotificationFailures(
    notifications: NotificationQueue[],
    errorMessage: string,
  ): Promise<void> {
    for (const notification of notifications) {
      notification.retryCount += 1;
      notification.errorMessage = errorMessage;

      if (notification.retryCount >= 3) {
        notification.status = NotificationStatusEnum.FAILED;
      }

      await this.queueRepository.save(notification);
    }

    this.logger.error(
      `Marked ${notifications.length} notifications as failed: ${errorMessage}`,
    );
  }

  /**
   * Processes notification results
   */
  private async processNotificationResults(
    notifications: NotificationQueue[],
    result: FarcasterNotificationResponse,
  ): Promise<void> {
    const successCount = result.successes?.length || 0;
    const failureCount = result.failures?.length || 0;

    this.logger.log(
      `Notification batch results: ${successCount} success, ${failureCount} failures`,
    );

    // Mark successful notifications
    if (result.successes) {
      for (const success of result.successes) {
        const notification = notifications.find(
          (n) => n.notificationId === success.notificationId,
        );
        if (notification) {
          notification.status = NotificationStatusEnum.SENT;
          notification.sentAt = new Date();
          await this.queueRepository.save(notification);
        }
      }
    }

    // Mark failed notifications
    if (result.failures) {
      for (const failure of result.failures) {
        const notification = notifications.find(
          (n) => n.notificationId === failure.notificationId,
        );
        if (notification) {
          notification.retryCount += 1;
          notification.errorMessage = failure.error;

          if (notification.retryCount >= 3) {
            notification.status = NotificationStatusEnum.FAILED;
          }

          await this.queueRepository.save(notification);
        }
      }
    }
  }

  /**
   * Groups notifications by URL for batch processing
   */
  private groupNotificationsByUrl(
    notifications: NotificationQueue[],
  ): Map<string, NotificationQueue[]> {
    const groups = new Map<string, NotificationQueue[]>();

    for (const notification of notifications) {
      // Skip notifications where user is null or doesn't have notification URL
      if (!notification.user || !notification.user.notificationUrl) {
        this.logger.warn(
          `Skipping notification ${notification.notificationId}: user is null or missing notificationUrl`,
        );
        continue;
      }

      const url = notification.user.notificationUrl;
      if (!groups.has(url)) {
        groups.set(url, []);
      }
      groups.get(url)!.push(notification);
    }

    return groups;
  }

  /**
   * Marks notifications as skipped
   */
  private async markNotificationsAsSkipped(
    notifications: NotificationQueue[],
    reason: string,
  ): Promise<void> {
    for (const notification of notifications) {
      notification.status = NotificationStatusEnum.SKIPPED;
      notification.errorMessage = reason;
      await this.queueRepository.save(notification);
    }
  }

  /**
   * Generates a short hash for idempotency
   */
  private generateShortHash(input: string): string {
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      const char = input.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Sleep utility for rate limiting
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
