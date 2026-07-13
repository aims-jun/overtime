import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { OriginGuard } from '../auth/origin.guard';
import { SessionGuard } from '../auth/session.guard';
import type { AuthUser } from '../auth/auth.service';
import { CurrentUser } from '../common/current-user';
import { CreateOvertimeDto } from './dto/create-overtime.dto';
import { UpdateOvertimeDto } from './dto/update-overtime.dto';
import type { MonthlyOvertime, OvertimeView } from './overtime.service';
import { OvertimeService } from './overtime.service';

@Controller('api/overtime')
@UseGuards(SessionGuard)
export class OvertimeController {
  constructor(private readonly service: OvertimeService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query('month') month: string,
  ): Promise<MonthlyOvertime> {
    return this.service.listMine(user.id, month);
  }

  @Post()
  @UseGuards(OriginGuard)
  create(
    @CurrentUser() user: AuthUser,
    @Body() input: CreateOvertimeDto,
  ): Promise<OvertimeView> {
    return this.service.create(user.id, input);
  }

  @Patch(':id')
  @UseGuards(OriginGuard)
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() input: UpdateOvertimeDto,
  ): Promise<OvertimeView> {
    return this.service.update(user.id, id, input);
  }

  @Delete(':id')
  @HttpCode(204)
  @UseGuards(OriginGuard)
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ): Promise<void> {
    return this.service.remove(user.id, id);
  }
}
