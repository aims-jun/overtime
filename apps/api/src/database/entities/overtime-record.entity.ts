import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { UserEntity } from './user.entity';

@Entity('overtime_records')
@Index('idx_overtime_user_work_date', ['userId', 'workDate'])
export class OvertimeRecordEntity {
  @PrimaryColumn('text')
  id!: string;

  @Column('text')
  userId!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'userId' })
  user!: UserEntity;

  @Column('text')
  workDate!: string;

  @Column('datetime')
  startAt!: Date;

  @Column('datetime')
  endAt!: Date;

  @Column('integer')
  durationMinutes!: number;

  @Column('text')
  reason!: string;

  @CreateDateColumn({ type: 'datetime' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'datetime' })
  updatedAt!: Date;
}
