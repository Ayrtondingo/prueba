import { Controller, Post, Get, Body, UseGuards, Req } from '@nestjs/common';
import { UsersService } from './users.service';
import { CreatePersonDto } from '../central-bank/dto/create-person.dto';
import { ClerkAuthGuard } from '../auth/clerk.guard';
import { Request as ExpressRequest } from 'express';

// Definimos la interfaz para reconocer el usuario del token
interface RequestWithUser extends ExpressRequest {
  user: { id: string };
}

// Interfaz para el body de sync
interface SyncUserDto {
  clerkId: string;
  email: string;
  fullName: string;
}

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @UseGuards(ClerkAuthGuard)
  async getMe(@Req() req: RequestWithUser) {
    const userId = req.user.id;
    const user = await this.usersService.findOne(userId);

    if (!user) {
      return {
        fullName: 'Usuario Cayman',
        balance: 0,
        accountNumber: null,
        transactions: [],
      };
    }

    return {
      fullName: user.fullName,
      balance: Number(user.account?.balance ?? 0),
      accountNumber: user.account?.accountNumber ?? null,
      alias: user.account?.alias ?? null,
      transactions: await this.usersService.getCombinedHistory(userId),
    };
  }

  @Post('sync')
  async syncUser(@Body() data: SyncUserDto) {
    return await this.usersService.createFromClerk(
      data.clerkId,
      data.email,
      data.fullName,
    );
  }

  // src/users/users.controller.ts

  @Post('sync-cbu') // O 'sync-central-bank', pero que sea IGUAL al fetch del frontend
  @UseGuards(ClerkAuthGuard)
  async syncCbu(@Req() req: RequestWithUser, @Body() data: CreatePersonDto) {
    const clerkId = req.user.id;
    // Agregamos un log para ver que la petición llega
    console.log(`Recibida petición de alias para: ${clerkId}`, data);
    return await this.usersService.syncWithCentralBank(clerkId, data);
  }

  // ... tus otros imports
  @Post('change-password')
  @UseGuards(ClerkAuthGuard)
  async changePassword(
    @Req() req: RequestWithUser, 
    @Body('newPassword') newPassword: string
  ) {
    const userId = req.user.id;
    return await this.usersService.updateClerkPassword(userId, newPassword);
  }
}
