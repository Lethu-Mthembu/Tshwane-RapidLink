-- RapidLink phase 1: staff identity, protected client sessions, in-app delivery,
-- responder readiness, operational timing and verified handover records.

alter table public.rapidlink_sessions
  add column if not exists client_token_hash text,
  add column if not exists client_token_created_at timestamptz;

create table if not exists public.rapidlink_staff_members (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.rapidlink_sessions(id) on delete cascade,
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('responder', 'supervisor')),
  station_key text not null,
  employee_key text,
  email text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, auth_user_id),
  unique (session_id, employee_key)
);

create table if not exists public.rapidlink_staff_invitations (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.rapidlink_sessions(id) on delete cascade,
  employee_key text not null,
  station_key text not null,
  role text not null check (role in ('responder', 'supervisor')),
  email text not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.rapidlink_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  staff_member_id uuid not null references public.rapidlink_staff_members(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth_secret text not null,
  user_agent text,
  failure_count integer not null default 0 check (failure_count >= 0),
  disabled_at timestamptz,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.rapidlink_employees
  add column if not exists work_email text,
  add column if not exists access_enabled boolean not null default false,
  add column if not exists availability text not null default 'available'
    check (availability in ('available', 'temporarily_unavailable')),
  add column if not exists availability_reason text,
  add column if not exists availability_updated_at timestamptz,
  add column if not exists last_heartbeat_at timestamptz;

alter table public.rapidlink_incidents
  add column if not exists first_offer_created_at timestamptz,
  add column if not exists first_notification_queued_at timestamptz,
  add column if not exists first_notification_delivered_at timestamptz,
  add column if not exists en_route_at timestamptz,
  add column if not exists arrived_at timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists last_updated_at timestamptz,
  add column if not exists completion_source text
    check (completion_source in ('client_confirmation', 'verified_handover', 'supervisor_override')),
  add column if not exists handover jsonb;

alter table public.rapidlink_incidents
  drop constraint if exists rapidlink_incidents_status_check;
alter table public.rapidlink_incidents
  add constraint rapidlink_incidents_status_check
  check (status in ('CREATING', 'WAITING_FOR_RESPONDER', 'ACCEPTED', 'EN_ROUTE', 'ARRIVED', 'HANDOVER_IN_PROGRESS', 'CANCELLATION_REQUESTED', 'CANCELLED', 'COMPLETED', 'FAILED'));

alter table public.rapidlink_notification_outbox
  add column if not exists channel text not null default 'in_app'
    check (channel in ('in_app', 'sms')),
  add column if not exists submitted_at timestamptz,
  add column if not exists delivered_at timestamptz,
  add column if not exists read_at timestamptz,
  add column if not exists failed_at timestamptz,
  add column if not exists attempts integer not null default 0 check (attempts >= 0);

alter table public.rapidlink_notification_outbox
  drop constraint if exists rapidlink_notification_outbox_channel_check;
alter table public.rapidlink_notification_outbox
  add constraint rapidlink_notification_outbox_channel_check
  check (channel in ('in_app', 'sms'));

alter table public.rapidlink_notification_outbox
  drop constraint if exists rapidlink_notification_outbox_delivery_status_check;
alter table public.rapidlink_notification_outbox
  add constraint rapidlink_notification_outbox_delivery_status_check
  check (delivery_status in ('queued', 'submitted', 'delivered', 'read', 'failed', 'no_subscription', 'simulated', 'sent'));

create index if not exists rapidlink_staff_user_idx
  on public.rapidlink_staff_members (auth_user_id, active);
create index if not exists rapidlink_invitation_token_idx
  on public.rapidlink_staff_invitations (token_hash)
  where used_at is null;
create index if not exists rapidlink_push_staff_idx
  on public.rapidlink_push_subscriptions (staff_member_id)
  where disabled_at is null;
create index if not exists rapidlink_employee_readiness_idx
  on public.rapidlink_employees (session_id, station_key, availability, last_heartbeat_at)
  where active = true;

alter table public.rapidlink_staff_members enable row level security;
alter table public.rapidlink_staff_invitations enable row level security;
alter table public.rapidlink_push_subscriptions enable row level security;

revoke all on table
  public.rapidlink_staff_members,
  public.rapidlink_staff_invitations,
  public.rapidlink_push_subscriptions
from anon, authenticated;

grant select, insert, update, delete on table
  public.rapidlink_staff_members,
  public.rapidlink_staff_invitations,
  public.rapidlink_push_subscriptions
to service_role;

create or replace function private.rapidlink_sync_phase1_projection()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  employee jsonb;
  incident jsonb;
  message jsonb;
begin
  for employee in select value from jsonb_array_elements(coalesce(new.state -> 'employees', '[]'::jsonb)) loop
    update public.rapidlink_employees
    set work_email = nullif(employee ->> 'workEmail', ''),
        access_enabled = coalesce((employee ->> 'accessEnabled')::boolean, false),
        availability = coalesce(nullif(employee ->> 'availability', ''), 'available'),
        availability_reason = nullif(employee ->> 'availabilityReason', ''),
        availability_updated_at = nullif(employee ->> 'availabilityUpdatedAt', '')::timestamptz,
        last_heartbeat_at = nullif(employee ->> 'lastHeartbeatAt', '')::timestamptz
    where session_id = new.id and employee_key = employee ->> 'id';
  end loop;

  for incident in select value from jsonb_array_elements(coalesce(new.state -> 'incidents', '[]'::jsonb)) loop
    update public.rapidlink_incidents
    set first_offer_created_at = nullif(incident ->> 'firstOfferCreatedAt', '')::timestamptz,
        first_notification_queued_at = nullif(incident ->> 'firstNotificationQueuedAt', '')::timestamptz,
        first_notification_delivered_at = nullif(incident ->> 'firstNotificationDeliveredAt', '')::timestamptz,
        en_route_at = nullif(incident ->> 'enRouteAt', '')::timestamptz,
        arrived_at = nullif(incident ->> 'arrivedAt', '')::timestamptz,
        cancelled_at = nullif(incident ->> 'cancelledAt', '')::timestamptz,
        last_updated_at = nullif(incident ->> 'lastUpdatedAt', '')::timestamptz,
        completion_source = nullif(incident ->> 'completionSource', ''),
        handover = incident -> 'handover'
    where session_id = new.id and incident_key = incident ->> 'id';
  end loop;

  for message in select value from jsonb_array_elements(coalesce(new.state -> 'messages', '[]'::jsonb)) loop
    update public.rapidlink_notification_outbox
    set channel = coalesce(nullif(message ->> 'channel', ''), 'in_app'),
        submitted_at = nullif(message ->> 'submittedAt', '')::timestamptz,
        delivered_at = nullif(message ->> 'deliveredAt', '')::timestamptz,
        read_at = nullif(message ->> 'readAt', '')::timestamptz,
        failed_at = nullif(message ->> 'failedAt', '')::timestamptz,
        attempts = coalesce((message ->> 'attempts')::integer, 0)
    where session_id = new.id and message_key = message ->> 'id';
  end loop;
  return new;
end;
$$;

drop trigger if exists rapidlink_sync_phase1_projection on public.rapidlink_sessions;
create trigger rapidlink_sync_phase1_projection
after insert or update of state on public.rapidlink_sessions
for each row execute function private.rapidlink_sync_phase1_projection();

revoke all on function private.rapidlink_sync_phase1_projection() from public, anon, authenticated;

create or replace function public.rapidlink_consume_staff_invitation(
  p_session_id uuid,
  p_token_hash text
)
returns table (
  id uuid,
  session_id uuid,
  employee_key text,
  station_key text,
  role text,
  email text,
  expires_at timestamptz,
  used_at timestamptz
)
language sql
security definer
set search_path = ''
as $$
  update public.rapidlink_staff_invitations invitation
  set used_at = now()
  where invitation.session_id = p_session_id
    and invitation.token_hash = p_token_hash
    and invitation.used_at is null
    and invitation.expires_at > now()
  returning invitation.id, invitation.session_id, invitation.employee_key, invitation.station_key,
    invitation.role, invitation.email, invitation.expires_at, invitation.used_at;
$$;

revoke all on function public.rapidlink_consume_staff_invitation(uuid, text) from public, anon, authenticated;
grant execute on function public.rapidlink_consume_staff_invitation(uuid, text) to service_role;
