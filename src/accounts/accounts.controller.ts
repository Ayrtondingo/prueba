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
import { ClerkAuthGuard } from '../auth/clerk.guard';
import { Request as ExpressRequest } from 'express';
import { CreatePersonDto } from '../central-bank/dto/create-person.dto';

// Interfaz para el usuario inyectado por el Guard
interface RequestWithUser extends ExpressRequest {
  user: {
    id: string;
  };
}

// Cambiamos 'any' por 'unknown' para cumplir con la regla no-unsafe-assignment
interface SyncAccountDto {
  cbu?: string;
  alias?: string;
  [key: string]: unknown;
}

@UseGuards(ClerkAuthGuard)
@Controller('accounts')
export class AccountsController {
  constructor(
    private readonly accountsService: AccountsService,
    private readonly usersService: UsersService,
  ) {}

  @Get('me')
  async getMyAccount(@Request() req: RequestWithUser) {
    const clerkId = req.user.id;
    const account = await this.accountsService.findByClerkId(clerkId);

    if (!account) {
      return null;
    }
    return account;
  }

  @Get('history')
  async getHistory(@Request() req: RequestWithUser) {
    return this.usersService.getCombinedHistory(req.user.id);
  }

  @Post('sync')
  async syncAccount(
    @Request() req: RequestWithUser,
    @Body() data: SyncAccountDto,
  ) {
    // Hacemos un cast a Record<string, any> aquí si el servicio espera 'any',
    // pero mantenemos el controlador limpio.
    return this.usersService.syncWithCentralBank(
      req.user.id,
      data as unknown as CreatePersonDto,
    );
  }
}
