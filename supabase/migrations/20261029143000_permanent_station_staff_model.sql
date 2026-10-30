-- RapidLink permanent staff directory.
-- Staff ownership is organisation -> physical station/service -> account.
-- Client session JSON is retained only as a compatibility transport for incidents.

create table if not exists public.rapidlink_organisations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.rapidlink_service_stations (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.rapidlink_organisations(id) on delete restrict,
  station_key text not null,
  name text not null,
  area text not null,
  latitude double precision not null,
  longitude double precision not null,
  service text not null check (service in ('police', 'ambulance', 'fire')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, station_key, service)
);

create table if not exists public.rapidlink_staff_accounts (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.rapidlink_organisations(id) on delete restrict,
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'supervisor', 'responder')),
  station_service_id uuid references public.rapidlink_service_stations(id) on delete restrict,
  email text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rapidlink_staff_scope_check check (
    (role = 'admin' and station_service_id is null)
    or (role in ('supervisor', 'responder') and station_service_id is not null)
  )
);

create unique index if not exists rapidlink_staff_email_unique
  on public.rapidlink_staff_accounts (lower(email));
create index if not exists rapidlink_staff_scope_idx
  on public.rapidlink_staff_accounts (station_service_id, role, active);

create table if not exists public.rapidlink_responders (
  id uuid primary key default gen_random_uuid(),
  staff_account_id uuid not null unique references public.rapidlink_staff_accounts(id) on delete cascade,
  station_service_id uuid not null references public.rapidlink_service_stations(id) on delete restrict,
  employee_number text not null,
  name text not null,
  surname text not null,
  phone text not null,
  active boolean not null default true,
  availability text not null default 'available'
    check (availability in ('available', 'temporarily_unavailable')),
  availability_reason text,
  availability_updated_at timestamptz,
  last_heartbeat_at timestamptz,
  dispatch_status text not null default 'available' check (dispatch_status in ('available', 'responding')),
  current_session_id uuid references public.rapidlink_sessions(id) on delete set null,
  current_incident_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (station_service_id, employee_number)
);

create index if not exists rapidlink_responders_dispatch_idx
  on public.rapidlink_responders (station_service_id, active, availability, dispatch_status)
  where active = true;
create unique index if not exists rapidlink_responder_employee_number_unique
  on public.rapidlink_responders (station_service_id, lower(employee_number));

create table if not exists public.rapidlink_push_subscriptions_v2 (
  id uuid primary key default gen_random_uuid(),
  staff_account_id uuid not null references public.rapidlink_staff_accounts(id) on delete cascade,
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

create table if not exists public.rapidlink_responder_attendance (
  id uuid primary key default gen_random_uuid(),
  responder_id uuid not null references public.rapidlink_responders(id) on delete cascade,
  duty_date date not null,
  shift_start timestamptz not null,
  shift_end timestamptz not null,
  choice text not null check (choice in ('present', 'absent', 'leave')),
  ended_at timestamptz,
  updated_by uuid not null references public.rapidlink_staff_accounts(id) on delete restrict,
  updated_at timestamptz not null default now(),
  unique (responder_id, duty_date)
);

create table if not exists public.rapidlink_staff_invitations_v2 (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.rapidlink_organisations(id) on delete restrict,
  role text not null check (role in ('admin', 'supervisor', 'responder')),
  station_service_id uuid references public.rapidlink_service_stations(id) on delete restrict,
  email text not null,
  employee_number text,
  responder_name text,
  responder_surname text,
  responder_phone text,
  token_hash text not null unique,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_by uuid not null references public.rapidlink_staff_accounts(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint rapidlink_invitation_scope_check check (
    (role = 'admin' and station_service_id is null)
    or (role in ('supervisor', 'responder') and station_service_id is not null)
  ),
  constraint rapidlink_responder_invitation_details_check check (
    role <> 'responder'
    or (employee_number is not null and responder_name is not null and responder_surname is not null and responder_phone is not null)
  )
);

create unique index if not exists rapidlink_pending_invitation_email_unique
  on public.rapidlink_staff_invitations_v2 (lower(email))
  where accepted_at is null and revoked_at is null;
create index if not exists rapidlink_invitation_v2_token_idx
  on public.rapidlink_staff_invitations_v2 (token_hash)
  where accepted_at is null and revoked_at is null;
create unique index if not exists rapidlink_pending_responder_number_unique
  on public.rapidlink_staff_invitations_v2 (station_service_id, lower(employee_number))
  where role = 'responder' and accepted_at is null and revoked_at is null;

create table if not exists public.rapidlink_staff_audit_events (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.rapidlink_organisations(id) on delete restrict,
  actor_staff_account_id uuid references public.rapidlink_staff_accounts(id) on delete set null,
  event_type text not null,
  target_type text,
  target_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.rapidlink_incidents
  add column if not exists dispatch_group_id text,
  add column if not exists dispatch_kind text
    check (dispatch_kind is null or dispatch_kind in ('police', 'ambulance', 'fire')),
  add column if not exists assigned_responder_id uuid references public.rapidlink_responders(id) on delete restrict;

alter table public.rapidlink_responder_offers
  add column if not exists responder_id uuid references public.rapidlink_responders(id) on delete restrict;
alter table public.rapidlink_notification_outbox
  add column if not exists responder_id uuid references public.rapidlink_responders(id) on delete restrict;
alter table public.rapidlink_assignments
  add column if not exists responder_id uuid references public.rapidlink_responders(id) on delete restrict;

-- Legacy employee rows are removed. Keep the text keys temporarily for the
-- compatibility projection, but make the permanent responder foreign keys the
-- authoritative relationships for new dispatch records.
alter table public.rapidlink_incidents
  drop constraint if exists rapidlink_incidents_session_id_assigned_employee_key_fkey;
alter table public.rapidlink_responder_offers
  drop constraint if exists rapidlink_responder_offers_session_id_employee_key_fkey;
alter table public.rapidlink_notification_outbox
  drop constraint if exists rapidlink_notification_outbox_session_id_employee_key_fkey;
alter table public.rapidlink_assignments
  drop constraint if exists rapidlink_assignments_session_id_employee_key_fkey;

create index if not exists rapidlink_incidents_responder_idx
  on public.rapidlink_incidents (assigned_responder_id)
  where assigned_responder_id is not null;
create index if not exists rapidlink_offers_responder_idx
  on public.rapidlink_responder_offers (responder_id, status, created_at);

insert into public.rapidlink_organisations (slug, name)
values ('tshwane-rapidlink', 'Tshwane RapidLink')
on conflict (slug) do update set name = excluded.name, active = true;

with organisation as (
  select id from public.rapidlink_organisations where slug = 'tshwane-rapidlink'
), stations(station_key, name, area, latitude, longitude) as (
  values
    ('station-central', 'Central Response Station', 'Pretoria Central', -25.7461::double precision, 28.1881::double precision),
    ('station-mamelodi', 'Mamelodi Response Station', 'Mamelodi', -25.7149::double precision, 28.3377::double precision),
    ('station-garankuwa', 'Ga-Rankuwa Response Station', 'Ga-Rankuwa', -25.6042::double precision, 28.0053::double precision),
    ('station-north', 'Northern Response Station', 'Wonderboom', -25.6878::double precision, 28.2016::double precision)
), services(service) as (
  values ('police'::text), ('ambulance'::text), ('fire'::text)
)
insert into public.rapidlink_service_stations
  (organisation_id, station_key, name, area, latitude, longitude, service)
select organisation.id, stations.station_key, stations.name, stations.area,
       stations.latitude, stations.longitude, services.service
from organisation cross join stations cross join services
on conflict (organisation_id, station_key, service) do update
set name = excluded.name, area = excluded.area, latitude = excluded.latitude,
    longitude = excluded.longitude, active = true, updated_at = now();

-- Service-role requests bypass RLS, so permanent ownership is enforced again
-- in database triggers. The API cannot attach staff to another organisation or
-- let an administrator bypass the supervisor-owned responder onboarding flow.
create or replace function private.rapidlink_validate_staff_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.role <> 'admin' and not exists (
    select 1
    from public.rapidlink_service_stations station
    where station.id = new.station_service_id
      and station.organisation_id = new.organisation_id
      and station.active = true
  ) then
    raise exception 'Staff station/service must belong to the same active organisation'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists rapidlink_validate_staff_scope on public.rapidlink_staff_accounts;
create trigger rapidlink_validate_staff_scope
before insert or update of organisation_id, role, station_service_id
on public.rapidlink_staff_accounts
for each row execute function private.rapidlink_validate_staff_scope();

create or replace function private.rapidlink_validate_responder_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.rapidlink_staff_accounts account
    where account.id = new.staff_account_id
      and account.role = 'responder'
      and account.station_service_id = new.station_service_id
      and account.active = true
  ) then
    raise exception 'Responder account and station/service scope do not match'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists rapidlink_validate_responder_scope on public.rapidlink_responders;
create trigger rapidlink_validate_responder_scope
before insert or update of staff_account_id, station_service_id
on public.rapidlink_responders
for each row execute function private.rapidlink_validate_responder_scope();

create or replace function private.rapidlink_validate_invitation_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  creator public.rapidlink_staff_accounts%rowtype;
begin
  select * into creator
  from public.rapidlink_staff_accounts account
  where account.id = new.created_by
    and account.organisation_id = new.organisation_id
    and account.active = true;

  if not found then
    raise exception 'Invitation creator is not an active member of the organisation'
      using errcode = '23514';
  end if;

  if new.station_service_id is not null and not exists (
    select 1
    from public.rapidlink_service_stations station
    where station.id = new.station_service_id
      and station.organisation_id = new.organisation_id
      and station.active = true
  ) then
    raise exception 'Invitation station/service must belong to the same active organisation'
      using errcode = '23514';
  end if;

  if new.role in ('admin', 'supervisor') and creator.role <> 'admin' then
    raise exception 'Only administrators may invite administrators or supervisors'
      using errcode = '42501';
  end if;

  if new.role = 'responder' and (
    creator.role <> 'supervisor'
    or creator.station_service_id is distinct from new.station_service_id
  ) then
    raise exception 'Responders must be invited by a supervisor in the same station/service'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists rapidlink_validate_invitation_scope on public.rapidlink_staff_invitations_v2;
create trigger rapidlink_validate_invitation_scope
before insert or update of organisation_id, role, station_service_id, created_by
on public.rapidlink_staff_invitations_v2
for each row execute function private.rapidlink_validate_invitation_scope();

revoke all on function private.rapidlink_validate_staff_scope() from public, anon, authenticated;
revoke all on function private.rapidlink_validate_responder_scope() from public, anon, authenticated;
revoke all on function private.rapidlink_validate_invitation_scope() from public, anon, authenticated;

alter table public.rapidlink_organisations enable row level security;
alter table public.rapidlink_service_stations enable row level security;
alter table public.rapidlink_staff_accounts enable row level security;
alter table public.rapidlink_responders enable row level security;
alter table public.rapidlink_responder_attendance enable row level security;
alter table public.rapidlink_push_subscriptions_v2 enable row level security;
alter table public.rapidlink_staff_invitations_v2 enable row level security;
alter table public.rapidlink_staff_audit_events enable row level security;

revoke all on table
  public.rapidlink_organisations,
  public.rapidlink_service_stations,
  public.rapidlink_staff_accounts,
  public.rapidlink_responders,
  public.rapidlink_responder_attendance,
  public.rapidlink_push_subscriptions_v2,
  public.rapidlink_staff_invitations_v2,
  public.rapidlink_staff_audit_events
from anon, authenticated;

grant select, insert, update, delete on table
  public.rapidlink_organisations,
  public.rapidlink_service_stations,
  public.rapidlink_staff_accounts,
  public.rapidlink_responders,
  public.rapidlink_responder_attendance,
  public.rapidlink_push_subscriptions_v2,
  public.rapidlink_staff_invitations_v2,
  public.rapidlink_staff_audit_events
to service_role;

create or replace function private.rapidlink_claim_staff_invitation(p_token_hash text)
returns setof public.rapidlink_staff_invitations_v2
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  update public.rapidlink_staff_invitations_v2 invitation
  set accepted_at = now()
  where invitation.token_hash = p_token_hash
    and invitation.accepted_at is null
    and invitation.revoked_at is null
    and invitation.expires_at > now()
  returning invitation.*;
end;
$$;

revoke all on function private.rapidlink_claim_staff_invitation(text) from public, anon, authenticated;
grant execute on function private.rapidlink_claim_staff_invitation(text) to service_role;

create or replace function private.rapidlink_sync_dispatch_projection()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  incident jsonb;
  offer jsonb;
  message jsonb;
begin
  for incident in select value from jsonb_array_elements(coalesce(new.state -> 'incidents', '[]'::jsonb)) loop
    update public.rapidlink_incidents
    set dispatch_group_id = nullif(incident ->> 'dispatchGroupId', ''),
        dispatch_kind = nullif(incident ->> 'dispatchKind', ''),
        assigned_responder_id = nullif(incident ->> 'assignedEmployeeId', '')::uuid
    where session_id = new.id and incident_key = incident ->> 'id';
  end loop;

  for offer in select value from jsonb_array_elements(coalesce(new.state -> 'offers', '[]'::jsonb)) loop
    update public.rapidlink_responder_offers
    set responder_id = nullif(offer ->> 'employeeId', '')::uuid
    where session_id = new.id and offer_key = offer ->> 'id';
  end loop;

  for message in select value from jsonb_array_elements(coalesce(new.state -> 'messages', '[]'::jsonb)) loop
    update public.rapidlink_notification_outbox
    set responder_id = nullif(message ->> 'employeeId', '')::uuid
    where session_id = new.id and message_key = message ->> 'id';
  end loop;

  for incident in select value from jsonb_array_elements(coalesce(new.state -> 'incidents', '[]'::jsonb)) loop
    update public.rapidlink_assignments
    set responder_id = nullif(incident ->> 'assignedEmployeeId', '')::uuid
    where session_id = new.id and incident_key = incident ->> 'id';
  end loop;
  return new;
end;
$$;

drop trigger if exists rapidlink_sync_dispatch_projection on public.rapidlink_sessions;
create trigger rapidlink_sync_dispatch_projection
after insert or update of state on public.rapidlink_sessions
for each row execute function private.rapidlink_sync_dispatch_projection();

revoke all on function private.rapidlink_sync_dispatch_projection() from public, anon, authenticated;

-- Remove legacy staff, responders and dispatch artifacts. Client profiles,
-- stations and incident history are deliberately retained.
update public.rapidlink_sessions session
set state = jsonb_set(
  jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(session.state, '{employees}', '[]'::jsonb, true),
        '{attendance}', '[]'::jsonb, true
      ),
      '{offers}', '[]'::jsonb, true
    ),
    '{messages}', '[]'::jsonb, true
  ),
  '{incidents}',
  coalesce((
    select jsonb_agg(
      case
        when incident ->> 'status' in ('ACCEPTED', 'EN_ROUTE', 'ARRIVED', 'HANDOVER_IN_PROGRESS', 'CANCELLATION_REQUESTED')
          then jsonb_set(
            jsonb_set(
              jsonb_set(
                jsonb_set(incident - 'assignedEmployeeId' - 'nextEscalationAt', '{status}', '"FAILED"'::jsonb, true),
                '{progress}', '"submission_failed"'::jsonb, true
              ),
              '{deliveryState}', '"failed"'::jsonb, true
            ),
            '{escalationStatus}', '"STOPPED"'::jsonb, true
          )
        else incident - 'assignedEmployeeId'
      end
    )
    from jsonb_array_elements(coalesce(session.state -> 'incidents', '[]'::jsonb)) incident
  ), '[]'::jsonb),
  true
), updated_at = now();

update public.rapidlink_incidents
set assigned_employee_key = null,
    status = case
      when status in ('ACCEPTED', 'EN_ROUTE', 'ARRIVED', 'HANDOVER_IN_PROGRESS', 'CANCELLATION_REQUESTED') then 'FAILED'
      else status
    end,
    progress = case
      when status in ('ACCEPTED', 'EN_ROUTE', 'ARRIVED', 'HANDOVER_IN_PROGRESS', 'CANCELLATION_REQUESTED') then 'submission_failed'
      else progress
    end,
    delivery_state = case
      when status in ('ACCEPTED', 'EN_ROUTE', 'ARRIVED', 'HANDOVER_IN_PROGRESS', 'CANCELLATION_REQUESTED') then 'failed'
      else delivery_state
    end,
    next_escalation_at = null;

delete from public.rapidlink_push_subscriptions;
delete from public.rapidlink_staff_invitations;
delete from public.rapidlink_staff_members;
delete from public.rapidlink_notification_outbox;
delete from public.rapidlink_responder_offers;
delete from public.rapidlink_assignments;
delete from public.rapidlink_attendance;
delete from public.rapidlink_employees;

-- The old session trigger must not repopulate legacy responder tables.
drop trigger if exists rapidlink_sync_phase1_projection on public.rapidlink_sessions;

