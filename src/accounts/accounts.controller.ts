import {
  Controller,
  Get,
  UseGuards,
  Request,
  Post,
  Body,
} from '@nestjs/common';
import { AccountsService } from './accounts.service';
import { UsersService } from '../users/users.service';
import { ClerkAuthGuard } from '../auth/clerk.guard'; // Asegúrate de que la ruta sea correcta

@UseGuards(ClerkAuthGuard)
@Controller('accounts')
export class AccountsController {
  constructor(
    private readonly accountsService: AccountsService,
    private readonly usersService: UsersService,
  ) {}

  @Get('me')
  async getMyAccount(@Request() req) {
    // req.user.id viene del ClerkAuthGuard
    const clerkId = req.user.id;
    const account = await this.accountsService.findByClerkId(clerkId);
    if (!account) {
      // Podrías lanzar un NotFoundException aquí o devolver un objeto vacío/null
      // El frontend ya maneja el caso de !account
      return null;
    }
    return account;
  }

  @Get('history')
  async getHistory(@Request() req) {
    return this.usersService.getCombinedHistory(req.user.id);
  }

  @Post('sync')
  async syncAccount(@Request() req, @Body() data: any) {
    return this.usersService.syncWithCentralBank(req.user.id, data);
  }
}
