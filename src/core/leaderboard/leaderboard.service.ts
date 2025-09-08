import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { User } from '../../models/User/User.model';
import { GetLeaderboardDto } from './dto/get-leaderboard.dto';

@Injectable()
export class LeaderboardService {
  private readonly logger = new Logger(LeaderboardService.name);

  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  async getLeaderboard(query: GetLeaderboardDto): Promise<any> {
    try {
      const queryBuilder = this.userRepository
        .createQueryBuilder('user')
        .where('user.settled_signals >= :minCalls', {
          minCalls: query.minSettledCalls || 5,
        })
        .orderBy('user.mfs_score', 'DESC')
        .addOrderBy('user.win_rate', 'DESC')
        .addOrderBy('user.settled_signals', 'DESC');

      // Pagination
      const page = Number(query.page || 1);
      const limit = Number(query.limit || 20);
      const skip = (page - 1) * limit;
      queryBuilder.skip(skip).take(limit);

      const [users, total] = await queryBuilder.getManyAndCount();

      // Calculate ranks
      const usersWithRanks = users.map((user, index) => ({
        fid: user.fid,
        username: user.username,
        pfp_url: user.pfp_url,
        isVerified: user.is_verified,
        totalSignals: user.total_signals,
        activeSignals: user.active_signals,
        settledSignals: user.settled_signals,
        winRate: parseFloat(user.win_rate.toString()),
        mfsScore: parseFloat(user.mfs_score.toString()),
        rank: skip + index + 1,
      }));

      return {
        users: usersWithRanks,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      this.logger.error('Error fetching leaderboard:', error);
      throw error;
    }
  }

  async getLeaderboardStats(): Promise<any> {
    try {
      // Get total users
      const totalUsers = await this.userRepository.count();

      // Get qualified users (minimum settled calls)
      const qualifiedUsers = await this.userRepository
        .createQueryBuilder('user')
        .where('user.settled_signals >= 5')
        .getCount();

      // Get aggregate stats
      const result = await this.userRepository
        .createQueryBuilder('user')
        .select([
          'COUNT(user.fid) as totalUsers',
          'SUM(user.total_signals) as totalSignals',
          'AVG(CASE WHEN user.settled_signals >= 5 THEN user.win_rate ELSE NULL END) as avgWinRate',
          'MAX(user.mfs_score) as topMfsScore',
        ])
        .getRawOne();

      return {
        totalUsers,
        qualifiedUsers,
        totalSignals: parseInt(result.totalSignals) || 0,
        avgWinRate: parseFloat(result.avgWinRate) || 0,
        topMfsScore: parseFloat(result.topMfsScore) || 0,
      };
    } catch (error) {
      this.logger.error('Error fetching leaderboard stats:', error);
      throw error;
    }
  }

  async updateUserRanks(): Promise<void> {
    try {
      // Get all qualified users ordered by MFS score
      const users = await this.userRepository
        .createQueryBuilder('user')
        .where('user.settled_signals >= 5')
        .orderBy('user.mfs_score', 'DESC')
        .addOrderBy('user.win_rate', 'DESC')
        .addOrderBy('user.settled_signals', 'DESC')
        .getMany();

      // Update ranks
      for (let i = 0; i < users.length; i++) {
        const user = users[i];
        user.rank = i + 1;
      }

      // Batch update
      if (users.length > 0) {
        await this.userRepository.save(users);
      }

      // Clear ranks for unqualified users
      await this.userRepository
        .createQueryBuilder()
        .update(User)
        .set({ rank: null })
        .where('settled_signals < 5')
        .execute();

      this.logger.log(`Updated ranks for ${users.length} qualified users`);
    } catch (error) {
      this.logger.error('Error updating user ranks:', error);
      throw error;
    }
  }
}
