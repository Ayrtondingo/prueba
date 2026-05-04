import { Injectable, UnauthorizedException } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

// Definimos la estructura del payload del JWT para evitar 'any'
interface JwtPayload {
  userId: string;
  email: string;
}

// Interfaz para la respuesta del Login
interface LoginResponse {
  access_token: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async signIn(email: string, pass: string): Promise<LoginResponse> {
    const user = await this.usersService.findOneByEmail(email);

    if (!user) {
      throw new UnauthorizedException('Credenciales incorrectas');
    }

    // En lugar de (user as any).password, usamos una aserción de tipo más segura
    // o simplemente confiamos en que tu entidad User tiene el campo password.
    // Si el linter se queja, es porque password no está en la entidad User.
    const userPassword = (user as unknown as { password?: string }).password;

    if (!userPassword) {
      throw new UnauthorizedException('El usuario no posee contraseña local');
    }

    const isMatch = await bcrypt.compare(pass, userPassword);

    if (!isMatch) {
      throw new UnauthorizedException('Credenciales incorrectas');
    }

    const payload: JwtPayload = { userId: user.id, email: user.email };

    return {
      access_token: await this.jwtService.signAsync(payload),
    };
  }
}
