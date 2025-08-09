// src/core/admin/admin.controller.ts
import {
  Body,
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Query,
  Res,
  UseGuards,
  Logger,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { AdminService } from './services/admin.service';
import { AuthorizationGuard, QuickAuthPayload } from '../../security/guards';
import { Session } from '../../security/decorators';
import { HttpStatus, hasError, hasResponse } from '../../utils';
import { User } from '../../models';

const adminFids = [16098];

@ApiTags('admin-service')
@Controller('admin-service')
@UseGuards(AuthorizationGuard)
export class AdminController {
  private readonly logger = new Logger(AdminController.name);
  private readonly AUTHORIZED_FID = 16098;

  constructor(private readonly adminService: AdminService) {
    console.log('AdminController initialized');
  }

  /**
   * Get all users for admin management
   */
  @Get('users')
  async getAllUsers(
    @Session() user: QuickAuthPayload,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 50,
    @Query('search') search: string = '',
    @Res() res: Response,
  ) {
    console.log(
      `getAllUsers called - user: ${user.sub}, page: ${page}, limit: ${limit}, search: "${search}"`,
    );

    // Check admin permissions
    if (!adminFids.includes(user.sub)) {
      console.log(`Access denied for user ${user.sub} - not in admin list`);
      return hasError(
        res,
        HttpStatus.FORBIDDEN,
        'getAllUsers',
        'Admin access required',
      );
    }

    try {
      console.log('Fetching users from service...');
      const [users, count] = await this.adminService.getAllUsers(
        page,
        limit,
        search,
      );
      console.log(
        `Found ${count} total users, returning ${users.length} results`,
      );

      return hasResponse(res, {
        users,
        pagination: {
          page,
          limit,
          total: count,
          totalPages: Math.ceil(count / limit),
        },
      });
    } catch (error) {
      console.error('Error in getAllUsers:', error);
      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'getAllUsers',
        error.message,
      );
    }
  }

  /**
   * Get user by ID
   */
  @Get('users/:id')
  async getUserById(
    @Session() user: QuickAuthPayload,
    @Param('id') id: number,
    @Res() res: Response,
  ) {
    console.log(`getUserById called - user: ${user.sub}, id: ${id}`);

    if (!adminFids.includes(user.sub)) {
      console.log(`Access denied for user ${user.sub} - not in admin list`);
      return hasError(
        res,
        HttpStatus.FORBIDDEN,
        'getUserById',
        'Admin access required',
      );
    }

    try {
      console.log(`Fetching user ${id}...`);
      const userData = await this.adminService.getUserById(id);
      console.log('User found:', {
        fid: userData.fid,
        username: userData.username,
      });

      return hasResponse(res, { user: userData });
    } catch (error) {
      console.error('Error in getUserById:', error);
      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'getUserById',
        error.message,
      );
    }
  }

  /**
   * Update user
   */
  @Put('users/:id')
  async updateUser(
    @Session() user: QuickAuthPayload,
    @Param('id') id: number,
    @Body() updateData: Partial<User>,
    @Res() res: Response,
  ) {
    console.log(`updateUser called - user: ${user.sub}, id: ${id}`, updateData);

    if (!adminFids.includes(user.sub)) {
      console.log(`Access denied for user ${user.sub} - not in admin list`);
      return hasError(
        res,
        HttpStatus.FORBIDDEN,
        'updateUser',
        'Admin access required',
      );
    }

    try {
      console.log(`Updating user ${id}...`);
      const updatedUser = await this.adminService.updateUser(id, updateData);
      console.log('User updated successfully:', {
        fid: updatedUser.fid,
        username: updatedUser.username,
        role: updatedUser.role,
      });

      return hasResponse(res, {
        user: updatedUser,
        message: 'User updated successfully',
      });
    } catch (error) {
      console.error('Error in updateUser:', error);
      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'updateUser',
        error.message,
      );
    }
  }

  /**
   * Delete user
   */
  @Delete('users/:id')
  async deleteUser(
    @Session() user: QuickAuthPayload,
    @Param('id') id: number,
    @Res() res: Response,
  ) {
    console.log(`deleteUser called - user: ${user.sub}, id: ${id}`);

    if (!adminFids.includes(user.sub)) {
      console.log(`Access denied for user ${user.sub} - not in admin list`);
      return hasError(
        res,
        HttpStatus.FORBIDDEN,
        'deleteUser',
        'Admin access required',
      );
    }

    try {
      console.log(`Deleting user ${id}...`);
      await this.adminService.deleteUser(id);
      console.log('User deleted successfully');
      return hasResponse(res, {
        message: 'User deleted successfully',
      });
    } catch (error) {
      console.error('Error in deleteUser:', error);
      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'deleteUser',
        error.message,
      );
    }
  }

  /**
   * Get admin users
   */
  @Get('users/admin/list')
  async getAdminUsers(@Session() user: QuickAuthPayload, @Res() res: Response) {
    console.log(`getAdminUsers called - user: ${user.sub}`);

    if (!adminFids.includes(user.sub)) {
      console.log(`Access denied for user ${user.sub} - not in admin list`);
      return hasError(
        res,
        HttpStatus.FORBIDDEN,
        'getAdminUsers',
        'Admin access required',
      );
    }

    try {
      console.log('Fetching admin users...');
      const adminUsers = await this.adminService.getAdminUsers();
      console.log(`Found ${adminUsers.length} admin users`);
      return hasResponse(res, { adminUsers });
    } catch (error) {
      console.error('Error in getAdminUsers:', error);
      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'getAdminUsers',
        error.message,
      );
    }
  }

  /**
   * Promote user to admin
   */
  @Post('users/:id/promote')
  async promoteToAdmin(
    @Session() user: QuickAuthPayload,
    @Param('id') id: number,
    @Res() res: Response,
  ) {
    console.log(`promoteToAdmin called - user: ${user.sub}, id: ${id}`);

    if (!adminFids.includes(user.sub)) {
      console.log(`Access denied for user ${user.sub} - not in admin list`);
      return hasError(
        res,
        HttpStatus.FORBIDDEN,
        'promoteToAdmin',
        'Admin access required',
      );
    }

    try {
      console.log(`Promoting user ${id} to admin...`);
      const promotedUser = await this.adminService.promoteToAdmin(id);
      console.log('User promoted successfully:', {
        fid: promotedUser.fid,
        username: promotedUser.username,
        role: promotedUser.role,
      });

      return hasResponse(res, {
        user: promotedUser,
        message: 'User promoted to admin successfully',
      });
    } catch (error) {
      console.error('Error in promoteToAdmin:', error);
      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'promoteToAdmin',
        error.message,
      );
    }
  }

  /**
   * Demote admin to user
   */
  @Post('users/:id/demote')
  async demoteToUser(
    @Session() user: QuickAuthPayload,
    @Param('id') id: number,
    @Res() res: Response,
  ) {
    console.log(`demoteToUser called - user: ${user.sub}, id: ${id}`);

    if (!adminFids.includes(user.sub)) {
      console.log(`Access denied for user ${user.sub} - not in admin list`);
      return hasError(
        res,
        HttpStatus.FORBIDDEN,
        'demoteToUser',
        'Admin access required',
      );
    }

    try {
      console.log(`Demoting user ${id} to regular user...`);
      const demotedUser = await this.adminService.demoteToUser(id);
      console.log('User demoted successfully:', {
        fid: demotedUser.fid,
        username: demotedUser.username,
        role: demotedUser.role,
      });

      return hasResponse(res, {
        user: demotedUser,
        message: 'User demoted to regular user successfully',
      });
    } catch (error) {
      console.error('Error in demoteToUser:', error);
      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'demoteToUser',
        error.message,
      );
    }
  }

  /**
   * Get user statistics
   */
  @Get('stats/users')
  async getUserStats(@Session() user: QuickAuthPayload, @Res() res: Response) {
    console.log(`getUserStats called - user: ${user.sub}`);

    if (!adminFids.includes(user.sub)) {
      console.log(`Access denied for user ${user.sub} - not in admin list`);
      return hasError(
        res,
        HttpStatus.FORBIDDEN,
        'getUserStats',
        'Admin access required',
      );
    }

    try {
      console.log('Fetching user statistics...');
      const stats = await this.adminService.getUserStats();
      console.log('User statistics retrieved:', stats);
      return hasResponse(res, { stats });
    } catch (error) {
      console.error('Error in getUserStats:', error);
      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'getUserStats',
        error.message,
      );
    }
  }

  /**
   * Get users with notifications enabled
   */
  @Get('users/notifications/enabled')
  async getUsersWithNotifications(
    @Session() user: QuickAuthPayload,
    @Res() res: Response,
  ) {
    console.log(`getUsersWithNotifications called - user: ${user.sub}`);

    if (!adminFids.includes(user.sub)) {
      console.log(`Access denied for user ${user.sub} - not in admin list`);
      return hasError(
        res,
        HttpStatus.FORBIDDEN,
        'getUsersWithNotifications',
        'Admin access required',
      );
    }

    try {
      console.log('Fetching users with notifications enabled...');
      const users = await this.adminService.getUsersWithNotifications();
      console.log(`Found ${users.length} users with notifications enabled`);
      return hasResponse(res, { users });
    } catch (error) {
      console.error('Error in getUsersWithNotifications:', error);
      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'getUsersWithNotifications',
        error.message,
      );
    }
  }

  /**
   * Disable user notifications
   */
  @Post('users/:id/disable-notifications')
  async disableUserNotifications(
    @Session() user: QuickAuthPayload,
    @Param('id') id: number,
    @Res() res: Response,
  ) {
    console.log(
      `disableUserNotifications called - user: ${user.sub}, id: ${id}`,
    );

    if (!adminFids.includes(user.sub)) {
      console.log(`Access denied for user ${user.sub} - not in admin list`);
      return hasError(
        res,
        HttpStatus.FORBIDDEN,
        'disableUserNotifications',
        'Admin access required',
      );
    }

    try {
      console.log(`Disabling notifications for user ${id}...`);
      const updatedUser = await this.adminService.disableUserNotifications(id);
      console.log('User notifications disabled successfully:', {
        fid: updatedUser.fid,
        username: updatedUser.username,
        notificationsEnabled: updatedUser.notificationsEnabled,
      });

      return hasResponse(res, {
        user: updatedUser,
        message: 'User notifications disabled successfully',
      });
    } catch (error) {
      console.error('Error in disableUserNotifications:', error);
      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'disableUserNotifications',
        error.message,
      );
    }
  }
}
