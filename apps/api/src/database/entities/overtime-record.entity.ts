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
  @PrimaryColumn('uuid')
  id!: string;

  @Column('uuid', { name: 'user_id' })
  userId!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'user_id' })
  user!: UserEntity;

  @Column('date', { name: 'work_date' })
  workDate!: string;

  @Column('timestamptz', { name: 'start_at' })
  startAt!: Date;

  @Column('timestamptz', { name: 'end_at' })
  endAt!: Date;

  @Column('integer', { name: 'duration_minutes' })
  durationMinutes!: number;

  @Column('text')
  reason!: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;
}
