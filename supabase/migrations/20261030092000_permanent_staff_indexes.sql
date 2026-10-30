-- Cover permanent staff and active dispatch foreign keys used by the API.

create index if not exists rapidlink_assignments_responder_idx
  on public.rapidlink_assignments (responder_id)
  where responder_id is not null;
create index if not exists rapidlink_assignments_offer_idx
  on public.rapidlink_assignments (session_id, offer_key)
  where offer_key is not null;

create index if not exists rapidlink_incident_information_incident_idx
  on public.rapidlink_incident_information (session_id, incident_key);
create index if not exists rapidlink_incident_stations_station_idx
  on public.rapidlink_incident_stations (session_id, station_key);
create index if not exists rapidlink_incidents_primary_station_idx
  on public.rapidlink_incidents (session_id, primary_station_key)
  where primary_station_key is not null;

create index if not exists rapidlink_outbox_responder_idx
  on public.rapidlink_notification_outbox (responder_id)
  where responder_id is not null;
create index if not exists rapidlink_outbox_incident_idx
  on public.rapidlink_notification_outbox (session_id, incident_key);
create index if not exists rapidlink_outbox_offer_idx
  on public.rapidlink_notification_outbox (session_id, offer_key);

create index if not exists rapidlink_push_v2_staff_idx
  on public.rapidlink_push_subscriptions_v2 (staff_account_id)
  where disabled_at is null;
create index if not exists rapidlink_attendance_updated_by_idx
  on public.rapidlink_responder_attendance (updated_by);
create index if not exists rapidlink_responders_current_session_idx
  on public.rapidlink_responders (current_session_id)
  where current_session_id is not null;
create index if not exists rapidlink_staff_organisation_idx
  on public.rapidlink_staff_accounts (organisation_id, active);
create index if not exists rapidlink_audit_actor_idx
  on public.rapidlink_staff_audit_events (actor_staff_account_id)
  where actor_staff_account_id is not null;
create index if not exists rapidlink_audit_organisation_idx
  on public.rapidlink_staff_audit_events (organisation_id, created_at desc);
create index if not exists rapidlink_invitation_v2_creator_idx
  on public.rapidlink_staff_invitations_v2 (created_by);
create index if not exists rapidlink_invitation_v2_organisation_idx
  on public.rapidlink_staff_invitations_v2 (organisation_id, created_at desc);
