import { Controller, Put, Body, UseGuards, Request } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { ClerkAuthGuard } from './clerk.guard';
import { Request as ExpressRequest } from 'express';

// Definimos la interfaz para que TypeScript reconozca req.user
interface RequestWithUser extends ExpressRequest {
  user: { id: string };
}

// Definimos una interfaz para los datos de actualización para evitar 'any'
interface UpdateProfileDto {
  fullName?: string;
  [key: string]: unknown; // Permite otros campos de forma segura
}

@Controller('auth')
export class AuthController {
  constructor(private readonly usersService: UsersService) {}

  @UseGuards(ClerkAuthGuard)
  @Put('profile')
  updateProfile(
    @Request() req: RequestWithUser,
    @Body() updateData: UpdateProfileDto,
  ) {
    // Ahora req.user.id es seguro y reconocido por el linter
    const clerkId = req.user.id;

    // Pasamos los datos al servicio
    return this.usersService.updateProfile(clerkId, updateData);
  }
}
