// Dependencies
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

// Models
import { User, UserRoleEnum, Signal } from '../../../models';

// Utils
import NeynarService from '../../../utils/neynar';

// DTOs
import { GetUsersQueryDto } from '../dto/get-users-query.dto';
import { UserCallsQueryDto } from '../dto/user-calls-query.dto';
import { UserDto, CallDto } from '../dto/user-response.dto';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Signal)
    private readonly signalRepository: Repository<Signal>,
  ) {}

  /**
   * Retrieves a user by their Farcaster ID with optional selected fields and relations.
   *
   * @param {User['fid']} fid - The Farcaster ID of the user to retrieve.
   * @param {(keyof User)[]} [select=[]] - Optional array of fields to select.
   * @param {(keyof User)[]} [relations=[]] - Optional array of relations to include.
   * @returns {Promise<User | undefined>} The user entity or undefined if not found.
   */
  async getByFid(
    fid: User['fid'],
    select: (keyof User)[] = [],
    relations: (keyof User)[] = [],
  ): Promise<User | undefined> {
    return this.userRepository.findOne({
      ...(select.length > 0 && {
        select,
      }),
      where: {
        fid,
      },
      ...(relations.length > 0 && {
        relations,
      }),
    });
  }

  /**
   * Upserts a user based on the provided Farcaster ID. This method checks if a user with the given Farcaster ID exists. If the user exists, it updates the user with the provided data; otherwise, it creates a new user with the given data and assigns a default role of USER.
   *
   * @param {User['fid']} fid - The Farcaster ID of the user to upsert.
   * @param {Partial<User>} data - An object containing the fields to update for an existing user or to set for a new user.
   * @returns {Promise<{isCreated: boolean; user: User}>} An object containing a boolean flag indicating if a new user was created and the upserted user entity.
   */
  async upsert(
    fid: User['fid'],
    data: Partial<User>,
  ): Promise<{ isCreated: boolean; user: User }> {
    let isCreated: boolean = false;
    let user = await this.userRepository.findOne({
      where: {
        fid,
      },
    });

    if (user) {
      Object.assign(user, data);
    } else {
      isCreated = true;
      user = this.userRepository.create({
        fid,
        ...data,
        role: UserRoleEnum.USER,
      });
    }

    await this.userRepository.save(user);

    return {
      isCreated,
      user,
    };
  }

  /**
   * Updates a user's data based on the provided user ID.
   *
   * @param {User['id']} id - The ID of the user to update.
   * @param {Partial<User>} data - The data to update the user with.
   * @returns {Promise<User>} The updated user entity.
   * @throws {Error} If the user with the specified ID is not found.
   */
  async update(fid: User['fid'], data: Partial<User>): Promise<User> {
    const user = await this.userRepository.findOne({
      where: {
        fid,
      },
    });

    if (!user) {
      throw new Error(`User with FID ${fid} not found.`);
    }

    Object.assign(user, data);
    await this.userRepository.save(user);

    return user;
  }

  /**
   * Updates a user's goal by their FID.
   *
   * @param {User['fid']} fid - The Farcaster ID of the user to update.
   * @param {string} goal - The goal to set for the user.
   * @param {'preset' | 'custom'} goalType - The type of goal being set.
   * @returns {Promise<User>} The updated user entity.
   * @throws {Error} If the user with the specified FID is not found.
   */
  async updateGoal(
    fid: User['fid'],
    goal: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _goalType: 'preset' | 'custom',
  ): Promise<User> {
    const user = await this.userRepository.findOne({
      where: {
        fid,
      },
    });

    if (!user) {
      throw new Error(`User with FID ${fid} not found.`);
    }

    // Update the goal and mark user as having an active training plan
    Object.assign(user, {
      currentGoal: goal,
      hasActiveTrainingPlan: true,
    });

    await this.userRepository.save(user);

    console.log(
      `✅ [UserService] Updated goal for user ${user.username} (FID: ${fid}): ${goal}`,
    );
    return user;
  }

  /**
   * Deletes a user by their ID.
   *
   * @param {User['id']} id - The ID of the user to delete.
   * @returns {Promise<boolean>} Returns true if the user was successfully deleted.
   * @throws {Error} If the user with the specified ID is not found.
   */
  async delete(fid: User['fid']): Promise<boolean> {
    const user = await this.userRepository.findOne({
      where: {
        fid,
      },
    });

    if (!user) {
      throw new Error(`User with FID ${fid} not found.`);
    }

    await this.userRepository.remove(user);

    return true;
  }

  /**
   * Creates a new user with the provided data.
   *
   * @param {User['fid']} fid - The Farcaster ID of the user to create.
   * @param {Partial<User>} data - The data to create the user with.
   * @returns {Promise<{user: User}>} An object containing the created user entity.
   */
  async create(fid: User['fid'], data: Partial<User>): Promise<{ user: User }> {
    const user = this.userRepository.create({
      fid,
      ...data,
      role: UserRoleEnum.USER,
    });

    const savedUser = await this.userRepository.save(user);

    return {
      user: savedUser,
    };
  }

  async getUsers(query: GetUsersQueryDto): Promise<{
    users: UserDto[];
    total: number;
    hasMore: boolean;
  }> {
    const { limit, offset, search, sortBy, sortOrder, verified } = query;

    const queryBuilder = this.userRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.signals', 'signal');

    if (search) {
      queryBuilder.andWhere(
        '(user.username ILIKE :search OR user.displayName ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    if (verified !== undefined) {
      queryBuilder.andWhere('user.isVerified = :verified', { verified });
    }

    queryBuilder
      .orderBy(`user.${sortBy}`, sortOrder.toUpperCase() as 'ASC' | 'DESC')
      .limit(limit)
      .offset(offset);

    const [users, total] = await queryBuilder.getManyAndCount();

    const userDtos: UserDto[] = users.map((user, index) => ({
      fid: user.fid,
      username: user.username,
      displayName: user.displayName || user.username,
      bio: user.bio,
      avatar: user.avatar,
      pfpUrl: user.pfpUrl,
      isVerified: user.isVerified,
      followerCount: user.followerCount,
      followingCount: user.followingCount,
      totalCalls: user.totalSignals,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    }));

    const result = {
      users: userDtos,
      total,
      hasMore: offset + limit < total,
    };

    return result;
  }

  async getUserWithDetails(fid: number): Promise<{
    user: UserDto;
    recentSignals: CallDto[];
  }> {
    const user = await this.userRepository.findOne({
      where: { fid },
      relations: ['signals'],
    });

    if (!user) {
      throw new Error(`User with FID ${fid} not found`);
    }

    const recentSignals = await this.signalRepository
      .createQueryBuilder('call')
      .leftJoin('call.user', 'user')
      .where('user.fid = :fid', { fid })
      .orderBy('call.timestamp', 'DESC')
      .limit(10)
      .getMany();

    const signalDtos: CallDto[] = recentSignals.map((signal) =>
      this.mapSignalToDto(signal),
    );

    const userDto: UserDto = {
      fid: user.fid,
      username: user.username,
      displayName: user.displayName || user.username,
      bio: user.bio,
      avatar: user.avatar,
      pfpUrl: user.pfpUrl,
      isVerified: user.isVerified,
      followerCount: user.followerCount,
      followingCount: user.followingCount,
      totalCalls: user.totalSignals,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    };

    const result = {
      user: userDto,
      recentSignals: signalDtos,
    };

    return result;
  }

  async getUserSignals(
    fid: number,
    query: UserCallsQueryDto,
  ): Promise<{
    signals: CallDto[];
    total: number;
    hasMore: boolean;
  }> {
    const { limit, offset, status } = query;

    const queryBuilder = this.signalRepository
      .createQueryBuilder('signal')
      .leftJoin('signal.user', 'user')
      .where('user.fid = :fid', { fid });

    if (status) {
      queryBuilder.andWhere('signal.status = :status', { status });
    }

    queryBuilder
      .orderBy('signal.timestamp', 'DESC')
      .limit(limit)
      .offset(offset);

    const [signals, total] = await queryBuilder.getManyAndCount();

    const signalDtos: CallDto[] = signals.map((signal) =>
      this.mapSignalToDto(signal),
    );

    return {
      signals: signalDtos,
      total,
      hasMore: offset + limit < total,
    };
  }

  private mapSignalToDto(signal: Signal): CallDto {
    // Get the first token from the tokens array as the primary token
    const primaryToken = signal.tokens?.[0];

    return {
      id: signal.signalId,
      signalId: signal.signalId,
      fid: signal.user?.fid || signal.fid,
      tokenAddress: primaryToken?.ca || '',
      ticker: primaryToken?.ticker || '',
      direction: primaryToken?.direction || '',
      timestamp: signal.timestamp,
      callPrice: parseFloat(primaryToken?.mc || '0') / 1e18, // Convert from scaled market cap
      transactionHash: '', // Not available in current metadata structure
    };
  }

  /**
   * Recalculates and updates the total signals count for all users
   * This is useful for fixing data inconsistencies
   */
  async recalculateTotalSignals(): Promise<void> {
    const users = await this.userRepository.find();

    for (const user of users) {
      const signalCount = await this.signalRepository.count({
        where: { fid: user.fid },
      });

      if (signalCount !== user.totalSignals) {
        await this.userRepository.update(user.fid, {
          totalSignals: signalCount,
        });
        console.log(
          `Updated user ${user.username} (FID: ${user.fid}) total signals from ${user.totalSignals} to ${signalCount}`,
        );
      }
    }
  }

  /**
   * Recalculates and updates the total signals count for a specific user
   */
  async recalculateUserTotalSignals(fid: number): Promise<void> {
    const user = await this.userRepository.findOne({ where: { fid } });
    if (!user) {
      throw new Error(`User with FID ${fid} not found`);
    }

    const signalCount = await this.signalRepository.count({
      where: { fid: user.fid },
    });

    if (signalCount !== user.totalSignals) {
      await this.userRepository.update(user.fid, { totalSignals: signalCount });
      console.log(
        `Updated user ${user.username} (FID: ${user.fid}) total signals from ${user.totalSignals} to ${signalCount}`,
      );
    }
  }
}
