import { Injectable, type OnModuleInit } from '@nestjs/common';
import { InvitationService } from '../../auth/invitation.service.js';
import { PlatformAlertsService } from './platform-alerts.service.js';

/** Tells the people who manage back-office users when a staff invitation is accepted. */
@Injectable()
export class InvitationAlerts implements OnModuleInit {
  constructor(
    private readonly invitations: InvitationService,
    private readonly alerts: PlatformAlertsService,
  ) {}

  onModuleInit() {
    this.invitations.onAccepted(async (accepted) => {
      if (!accepted.platformStaffId) return;
      await this.alerts.notify(
        'user.invitation',
        {
          title: `${accepted.name} accepted their invitation`,
          detail: 'Users · they can now sign in to the back office',
          link: `/users/${accepted.userId}`,
          entityType: 'Invitation',
          entityId: accepted.invitationId,
        },
        { permission: 'Users.View', exclude: [accepted.userId] },
      );
    });
  }
}
