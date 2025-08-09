// src/core/admin/services/admin.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
import { User, UserRoleEnum } from '../../../models';

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {
    console.log('AdminService initialized');
  }

  // ================================
  // USER MANAGEMENT
  // ================================

  /**
   * Get all users with pagination and search
   */
  async getAllUsers(
    page: number = 1,
    limit: number = 50,
    search: string = '',
  ): Promise<[User[], number]> {
    const skip = (page - 1) * limit;

    return this.userRepository.findAndCount({
      where: search ? { username: Like(`%${search}%`) } : {},
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });
  }

  /**
   * Get user by ID
   */
  async getUserById(fid: number): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { fid },
    });

    if (!user) {
      throw new Error('User not found');
    }

    return user;
  }

  /**
   * Update user
   */
  async updateUser(fid: number, updateData: Partial<User>): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { fid },
    });

    if (!user) {
      throw new Error('User not found');
    }

    // Update user fields
    Object.assign(user, updateData);

    const savedUser = await this.userRepository.save(user);
    console.log('User updated successfully:', savedUser);
    return savedUser;
  }

  /**
   * Delete user
   */
  async deleteUser(fid: number): Promise<void> {
    const user = await this.userRepository.findOne({ where: { fid } });

    if (!user) {
      throw new Error('User not found');
    }

    await this.userRepository.remove(user);
    console.log(`User ${fid} deleted successfully`);
  }

  /**
   * Get users by role
   */
  async getUsersByRole(role: UserRoleEnum): Promise<User[]> {
    return this.userRepository.find({
      where: { role },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Get admin users
   */
  async getAdminUsers(): Promise<User[]> {
    return this.getUsersByRole(UserRoleEnum.ADMIN);
  }

  /**
   * Promote user to admin
   */
  async promoteToAdmin(fid: number): Promise<User> {
    return this.updateUser(fid, { role: UserRoleEnum.ADMIN });
  }

  /**
   * Demote admin to user
   */
  async demoteToUser(fid: number): Promise<User> {
    return this.updateUser(fid, { role: UserRoleEnum.USER });
  }

  /**
   * Get user statistics
   */
  async getUserStats(): Promise<{
    totalUsers: number;
    adminUsers: number;
    regularUsers: number;
  }> {
    const [totalUsers, adminUsers, regularUsers] = await Promise.all([
      this.userRepository.count(),
      this.userRepository.count({ where: { role: UserRoleEnum.ADMIN } }),
      this.userRepository.count({ where: { role: UserRoleEnum.USER } }),
    ]);

    return {
      totalUsers,
      adminUsers,
      regularUsers,
    };
  }

  /**
   * Get users with notifications enabled
   */
  async getUsersWithNotifications(): Promise<User[]> {
    return this.userRepository.find({
      where: { notificationsEnabled: true },
      select: ['fid', 'username', 'notificationToken', 'notificationUrl'],
    });
  }

  /**
   * Disable user notifications
   */
  async disableUserNotifications(fid: number): Promise<User> {
    return this.updateUser(fid, {
      notificationsEnabled: false,
      notificationToken: null,
      notificationUrl: null,
    });
  }
}
