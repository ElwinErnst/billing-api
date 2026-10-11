import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('merchant_provider_events')
@Index('UQ_merchant_provider_events_event', ['connectionId', 'providerEventId'], { unique: true })
export class MerchantProviderEventEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'merchant_id', type: 'uuid' })
  merchantId!: string;

  @Column({ name: 'connection_id', type: 'uuid' })
  connectionId!: string;

  @Column({ name: 'provider_event_id', type: 'varchar', length: 191 })
  providerEventId!: string;

  @Column({ name: 'event_type', type: 'varchar', length: 191 })
  eventType!: string;

  @CreateDateColumn({ name: 'received_at' })
  receivedAt!: Date;
}
