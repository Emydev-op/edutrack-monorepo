import { Module } from '@nestjs/common';
import { CommsDispatchService } from './comms-dispatch.service.js';
import { SmsLedgerService } from './sms-ledger.service.js';

/**
 * The messaging core (dispatch, SMS units ledger), for every module that sends: Communication's
 * own screens, the class register's absence alerts, results publishing, and the back office's
 * top-ups.
 */
@Module({
  providers: [SmsLedgerService, CommsDispatchService],
  exports: [SmsLedgerService, CommsDispatchService],
})
export class CommsCoreModule {}
