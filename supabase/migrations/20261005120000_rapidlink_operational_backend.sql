create schema if not exists private;
create schema if not exists extensions;
create extension if not exists postgis with schema extensions;

drop policy if exists "active prototype rooms are readable" on public.rapidlink_sessions;
revoke all on table public.rapidlink_sessions from anon, authenticated;
grant select, insert, update, delete on table public.rapidlink_sessions to service_role;

create table if not exists public.rapidlink_action_log (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.rapidlink_sessions(id) on delete cascade,
  action_id text not null,
  action_type text not null,
  action_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (session_id, action_id)
);

create table if not exists public.rapidlink_stations (
  session_id uuid not null references public.rapidlink_sessions(id) on delete cascade,
  station_key text not null,
  name text not null,
  area text not null,
  latitude double precision not null,
  longitude double precision not null,
  location extensions.geography(point, 4326) not null,
  services text[] not null default '{}',
  primary key (session_id, station_key)
);

create table if not exists public.rapidlink_employees (
  session_id uuid not null references public.rapidlink_sessions(id) on delete cascade,
  employee_key text not null,
  employee_number text not null,
  name text not null,
  surname text not null,
  phone text not null,
  service text not null check (service in ('police', 'ambulance', 'fire')),
  station_key text not null,
  active boolean not null default true,
  primary key (session_id, employee_key),
  unique (session_id, employee_number),
  foreign key (session_id, station_key) references public.rapidlink_stations(session_id, station_key)
);

create table if not exists public.rapidlink_attendance (
  session_id uuid not null references public.rapidlink_sessions(id) on delete cascade,
  attendance_key text not null,
  employee_key text not null,
  attendance_date date not null,
  shift_start timestamptz not null,
  shift_end timestamptz not null,
  choice text not null check (choice in ('present', 'absent', 'leave')),
  ended_at timestamptz,
  updated_at timestamptz not null,
  updated_by text not null,
  primary key (session_id, attendance_key),
  foreign key (session_id, employee_key) references public.rapidlink_employees(session_id, employee_key)
);

create table if not exists public.rapidlink_client_profiles (
  session_id uuid primary key references public.rapidlink_sessions(id) on delete cascade,
  client_key text not null,
  name text not null,
  surname text not null,
  email text not null,
  south_african_id text not null,
  phone text not null,
  next_of_kin jsonb not null,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists public.rapidlink_profile_secrets (
  session_id uuid primary key references public.rapidlink_client_profiles(session_id) on delete cascade,
  pin_salt text not null,
  pin_derived_hash text not null,
  pin_iterations integer not null check (pin_iterations >= 100000),
  failed_attempts integer not null default 0 check (failed_attempts between 0 and 5),
  locked_until timestamptz
);

create table if not exists public.rapidlink_incidents (
  session_id uuid not null references public.rapidlink_sessions(id) on delete cascade,
  incident_key text not null,
  reference text not null,
  client_key text not null,
  service text not null check (service in ('police', 'ambulance', 'fire', 'sos')),
  status text not null check (status in ('CREATING', 'WAITING_FOR_RESPONDER', 'ACCEPTED', 'EN_ROUTE', 'ARRIVED', 'CANCELLATION_REQUESTED', 'CANCELLED', 'COMPLETED', 'FAILED')),
  progress text not null,
  delivery_state text not null,
  created_at timestamptz not null,
  submitted_at timestamptz,
  accepted_at timestamptz,
  completed_at timestamptz,
  assigned_employee_key text,
  primary_station_key text,
  search_stage integer not null default 0,
  escalation_status text not null check (escalation_status in ('INITIAL_STATION', 'SEARCH_EXPANDED', 'ALL_STATIONS_NOTIFIED', 'STOPPED')),
  next_escalation_at timestamptz,
  latitude double precision,
  longitude double precision,
  location extensions.geography(point, 4326),
  location_accuracy double precision,
  location_captured_at timestamptz,
  location_source text,
  location_note text,
  payload jsonb not null,
  primary key (session_id, incident_key),
  unique (session_id, reference),
  foreign key (session_id, assigned_employee_key) references public.rapidlink_employees(session_id, employee_key),
  foreign key (session_id, primary_station_key) references public.rapidlink_stations(session_id, station_key)
);

create table if not exists public.rapidlink_incident_stations (
  session_id uuid not null,
  incident_key text not null,
  station_key text not null,
  stage integer not null,
  notified_at timestamptz not null,
  primary key (session_id, incident_key, station_key),
  foreign key (session_id, incident_key) references public.rapidlink_incidents(session_id, incident_key) on delete cascade,
  foreign key (session_id, station_key) references public.rapidlink_stations(session_id, station_key)
);

create table if not exists public.rapidlink_incident_information (
  session_id uuid not null,
  information_key text not null,
  incident_key text not null,
  happened text not null default '',
  landmark text not null default '',
  attachments jsonb not null default '[]'::jsonb,
  created_at timestamptz not null,
  primary key (session_id, information_key),
  foreign key (session_id, incident_key) references public.rapidlink_incidents(session_id, incident_key) on delete cascade
);

create table if not exists public.rapidlink_responder_offers (
  session_id uuid not null,
  offer_key text not null,
  incident_key text not null,
  employee_key text not null,
  status text not null check (status in ('open', 'declined', 'accepted', 'closed')),
  created_at timestamptz not null,
  responded_at timestamptz,
  primary key (session_id, offer_key),
  unique (session_id, incident_key, employee_key),
  foreign key (session_id, incident_key) references public.rapidlink_incidents(session_id, incident_key) on delete cascade,
  foreign key (session_id, employee_key) references public.rapidlink_employees(session_id, employee_key)
);

create table if not exists public.rapidlink_notification_outbox (
  session_id uuid not null,
  message_key text not null,
  offer_key text not null,
  incident_key text not null,
  employee_key text not null,
  channel text not null default 'sms' check (channel = 'sms'),
  provider text not null default 'simulated',
  delivery_status text not null default 'simulated' check (delivery_status in ('simulated', 'queued', 'sent', 'failed')),
  recipient_phone text not null,
  message_body text not null,
  response_path text not null,
  created_at timestamptz not null,
  sent_at timestamptz,
  last_error text,
  primary key (session_id, message_key),
  foreign key (session_id, offer_key) references public.rapidlink_responder_offers(session_id, offer_key) on delete cascade,
  foreign key (session_id, incident_key) references public.rapidlink_incidents(session_id, incident_key) on delete cascade,
  foreign key (session_id, employee_key) references public.rapidlink_employees(session_id, employee_key)
);

create table if not exists public.rapidlink_assignments (
  session_id uuid not null,
  incident_key text not null,
  employee_key text not null,
  offer_key text,
  assigned_at timestamptz not null,
  released_at timestamptz,
  release_reason text,
  primary key (session_id, incident_key),
  foreign key (session_id, incident_key) references public.rapidlink_incidents(session_id, incident_key) on delete cascade,
  foreign key (session_id, employee_key) references public.rapidlink_employees(session_id, employee_key),
  foreign key (session_id, offer_key) references public.rapidlink_responder_offers(session_id, offer_key)
);

create table if not exists public.rapidlink_incident_events (
  session_id uuid not null references public.rapidlink_sessions(id) on delete cascade,
  event_key text not null,
  event_type text not null,
  message text not null,
  created_at timestamptz not null,
  primary key (session_id, event_key)
);

create index if not exists rapidlink_incidents_active_idx
  on public.rapidlink_incidents (session_id, status, next_escalation_at)
  where status = 'WAITING_FOR_RESPONDER';
create index if not exists rapidlink_offers_open_idx
  on public.rapidlink_responder_offers (session_id, incident_key, created_at)
  where status = 'open';
create index if not exists rapidlink_attendance_employee_idx
  on public.rapidlink_attendance (session_id, employee_key, attendance_date);
create index if not exists rapidlink_outbox_delivery_idx
  on public.rapidlink_notification_outbox (delivery_status, created_at)
  where delivery_status in ('queued', 'failed');
create index if not exists rapidlink_station_location_idx
  on public.rapidlink_stations using gist (location);
create index if not exists rapidlink_incident_location_idx
  on public.rapidlink_incidents using gist (location);

alter table public.rapidlink_action_log enable row level security;
alter table public.rapidlink_stations enable row level security;
alter table public.rapidlink_employees enable row level security;
alter table public.rapidlink_attendance enable row level security;
alter table public.rapidlink_client_profiles enable row level security;
alter table public.rapidlink_profile_secrets enable row level security;
alter table public.rapidlink_incidents enable row level security;
alter table public.rapidlink_incident_stations enable row level security;
alter table public.rapidlink_incident_information enable row level security;
alter table public.rapidlink_responder_offers enable row level security;
alter table public.rapidlink_notification_outbox enable row level security;
alter table public.rapidlink_assignments enable row level security;
alter table public.rapidlink_incident_events enable row level security;

revoke all on table
  public.rapidlink_action_log,
  public.rapidlink_stations,
  public.rapidlink_employees,
  public.rapidlink_attendance,
  public.rapidlink_client_profiles,
  public.rapidlink_profile_secrets,
  public.rapidlink_incidents,
  public.rapidlink_incident_stations,
  public.rapidlink_incident_information,
  public.rapidlink_responder_offers,
  public.rapidlink_notification_outbox,
  public.rapidlink_assignments,
  public.rapidlink_incident_events
from anon, authenticated;

grant select, insert, update, delete on table
  public.rapidlink_action_log,
  public.rapidlink_stations,
  public.rapidlink_employees,
  public.rapidlink_attendance,
  public.rapidlink_client_profiles,
  public.rapidlink_profile_secrets,
  public.rapidlink_incidents,
  public.rapidlink_incident_stations,
  public.rapidlink_incident_information,
  public.rapidlink_responder_offers,
  public.rapidlink_notification_outbox,
  public.rapidlink_assignments,
  public.rapidlink_incident_events
to service_role;
grant usage, select on sequence public.rapidlink_action_log_id_seq to service_role;

create or replace function private.rapidlink_project_session_state()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  station jsonb;
  employee jsonb;
  attendance jsonb;
  incident jsonb;
  information jsonb;
  offer jsonb;
  message jsonb;
  audit_event jsonb;
  station_key text;
  station_stage integer;
  profile jsonb := new.state -> 'profile';
  secret jsonb := new.state -> 'profileSecurity';
begin
  delete from public.rapidlink_assignments where session_id = new.id;
  delete from public.rapidlink_notification_outbox where session_id = new.id;
  delete from public.rapidlink_responder_offers where session_id = new.id;
  delete from public.rapidlink_incident_information where session_id = new.id;
  delete from public.rapidlink_incident_stations where session_id = new.id;
  delete from public.rapidlink_incidents where session_id = new.id;
  delete from public.rapidlink_attendance where session_id = new.id;
  delete from public.rapidlink_employees where session_id = new.id;
  delete from public.rapidlink_stations where session_id = new.id;
  delete from public.rapidlink_profile_secrets where session_id = new.id;
  delete from public.rapidlink_client_profiles where session_id = new.id;
  delete from public.rapidlink_incident_events where session_id = new.id;

  for station in select value from jsonb_array_elements(coalesce(new.state -> 'stations', '[]'::jsonb)) loop
    insert into public.rapidlink_stations (
      session_id, station_key, name, area, latitude, longitude, location, services
    ) values (
      new.id,
      station ->> 'id',
      station ->> 'name',
      station ->> 'area',
      (station ->> 'latitude')::double precision,
      (station ->> 'longitude')::double precision,
      extensions.st_setsrid(extensions.st_makepoint((station ->> 'longitude')::double precision, (station ->> 'latitude')::double precision), 4326)::extensions.geography,
      array(select jsonb_array_elements_text(coalesce(station -> 'services', '[]'::jsonb)))
    );
  end loop;

  for employee in select value from jsonb_array_elements(coalesce(new.state -> 'employees', '[]'::jsonb)) loop
    insert into public.rapidlink_employees (
      session_id, employee_key, employee_number, name, surname, phone, service, station_key, active
    ) values (
      new.id, employee ->> 'id', employee ->> 'employeeNumber', employee ->> 'name', employee ->> 'surname',
      employee ->> 'phone', employee ->> 'service', employee ->> 'stationId', coalesce((employee ->> 'active')::boolean, false)
    );
  end loop;

  for attendance in select value from jsonb_array_elements(coalesce(new.state -> 'attendance', '[]'::jsonb)) loop
    insert into public.rapidlink_attendance (
      session_id, attendance_key, employee_key, attendance_date, shift_start, shift_end, choice, ended_at, updated_at, updated_by
    ) values (
      new.id, attendance ->> 'id', attendance ->> 'employeeId', (attendance ->> 'date')::date,
      (attendance ->> 'shiftStart')::timestamptz, (attendance ->> 'shiftEnd')::timestamptz, attendance ->> 'choice',
      nullif(attendance ->> 'endedAt', '')::timestamptz, (attendance ->> 'updatedAt')::timestamptz, attendance ->> 'updatedBy'
    );
  end loop;

  if profile is not null and profile <> 'null'::jsonb then
    insert into public.rapidlink_client_profiles (
      session_id, client_key, name, surname, email, south_african_id, phone, next_of_kin, created_at, updated_at
    ) values (
      new.id, profile ->> 'id', profile ->> 'name', profile ->> 'surname', profile ->> 'email',
      profile ->> 'southAfricanId', profile ->> 'phone', profile -> 'nextOfKin',
      (profile ->> 'createdAt')::timestamptz, (profile ->> 'updatedAt')::timestamptz
    );

    if secret is not null and secret <> 'null'::jsonb then
      insert into public.rapidlink_profile_secrets (
        session_id, pin_salt, pin_derived_hash, pin_iterations, failed_attempts, locked_until
      ) values (
        new.id, secret ->> 'salt', secret ->> 'derivedHash', (secret ->> 'iterations')::integer,
        coalesce((secret ->> 'failedAttempts')::integer, 0), nullif(secret ->> 'lockedUntil', '')::timestamptz
      );
    end if;
  end if;

  for incident in select value from jsonb_array_elements(coalesce(new.state -> 'incidents', '[]'::jsonb)) loop
    insert into public.rapidlink_incidents (
      session_id, incident_key, reference, client_key, service, status, progress, delivery_state,
      created_at, submitted_at, accepted_at, completed_at, assigned_employee_key, primary_station_key,
      search_stage, escalation_status, next_escalation_at, latitude, longitude, location,
      location_accuracy, location_captured_at, location_source, location_note, payload
    ) values (
      new.id, incident ->> 'id', incident ->> 'reference', incident ->> 'clientId', incident ->> 'service',
      incident ->> 'status', incident ->> 'progress', incident ->> 'deliveryState',
      (incident ->> 'createdAt')::timestamptz, nullif(incident ->> 'submittedAt', '')::timestamptz,
      nullif(incident ->> 'acceptedAt', '')::timestamptz, nullif(incident ->> 'completedAt', '')::timestamptz,
      nullif(incident ->> 'assignedEmployeeId', ''), nullif(incident ->> 'stationId', ''),
      coalesce((incident ->> 'searchStage')::integer, 0), incident ->> 'escalationStatus',
      nullif(incident ->> 'nextEscalationAt', '')::timestamptz,
      nullif(incident -> 'location' ->> 'latitude', '')::double precision,
      nullif(incident -> 'location' ->> 'longitude', '')::double precision,
      case when incident -> 'location' is null or incident -> 'location' = 'null'::jsonb then null else
        extensions.st_setsrid(extensions.st_makepoint((incident -> 'location' ->> 'longitude')::double precision, (incident -> 'location' ->> 'latitude')::double precision), 4326)::extensions.geography end,
      nullif(incident -> 'location' ->> 'accuracy', '')::double precision,
      nullif(incident -> 'location' ->> 'capturedAt', '')::timestamptz,
      incident -> 'location' ->> 'source', incident ->> 'locationNote', incident
    );

    station_stage := 0;
    for station_key in select jsonb_array_elements_text(coalesce(incident -> 'notifiedStationIds', '[]'::jsonb)) loop
      station_stage := station_stage + 1;
      insert into public.rapidlink_incident_stations (session_id, incident_key, station_key, stage, notified_at)
      values (new.id, incident ->> 'id', station_key, station_stage, coalesce(nullif(incident ->> 'submittedAt', '')::timestamptz, (incident ->> 'createdAt')::timestamptz));
    end loop;

    for information in select value from jsonb_array_elements(coalesce(incident -> 'information', '[]'::jsonb)) loop
      insert into public.rapidlink_incident_information (
        session_id, information_key, incident_key, happened, landmark, attachments, created_at
      ) values (
        new.id, information ->> 'id', incident ->> 'id', coalesce(information ->> 'happened', ''),
        coalesce(information ->> 'landmark', ''), coalesce(information -> 'attachments', '[]'::jsonb),
        (information ->> 'createdAt')::timestamptz
      );
    end loop;
  end loop;

  for offer in select value from jsonb_array_elements(coalesce(new.state -> 'offers', '[]'::jsonb)) loop
    insert into public.rapidlink_responder_offers (
      session_id, offer_key, incident_key, employee_key, status, created_at, responded_at
    ) values (
      new.id, offer ->> 'id', offer ->> 'incidentId', offer ->> 'employeeId', offer ->> 'status',
      (offer ->> 'createdAt')::timestamptz, nullif(offer ->> 'respondedAt', '')::timestamptz
    );
  end loop;

  for message in select value from jsonb_array_elements(coalesce(new.state -> 'messages', '[]'::jsonb)) loop
    select value into employee
    from jsonb_array_elements(coalesce(new.state -> 'employees', '[]'::jsonb))
    where value ->> 'id' = message ->> 'employeeId'
    limit 1;
    select value into incident
    from jsonb_array_elements(coalesce(new.state -> 'incidents', '[]'::jsonb))
    where value ->> 'id' = message ->> 'incidentId'
    limit 1;
    insert into public.rapidlink_notification_outbox (
      session_id, message_key, offer_key, incident_key, employee_key, provider, delivery_status,
      recipient_phone, message_body, response_path, created_at, sent_at
    ) values (
      new.id, message ->> 'id', message ->> 'offerId', message ->> 'incidentId', message ->> 'employeeId',
      coalesce(message ->> 'provider', 'simulated'), coalesce(message ->> 'deliveryStatus', 'simulated'),
      coalesce(message ->> 'recipientPhone', employee ->> 'phone'),
      coalesce(message ->> 'body', 'RapidLink emergency alert. Reference: ' || (incident ->> 'reference')),
      coalesce(message ->> 'responsePath', '/responder/offers/' || (message ->> 'offerId') || '?session=' || new.code),
      (message ->> 'createdAt')::timestamptz,
      nullif(message ->> 'sentAt', '')::timestamptz
    );
  end loop;

  for incident in select value from jsonb_array_elements(coalesce(new.state -> 'incidents', '[]'::jsonb)) loop
    if nullif(incident ->> 'assignedEmployeeId', '') is not null then
      select value into offer
      from jsonb_array_elements(coalesce(new.state -> 'offers', '[]'::jsonb))
      where value ->> 'incidentId' = incident ->> 'id'
        and value ->> 'employeeId' = incident ->> 'assignedEmployeeId'
        and value ->> 'status' = 'accepted'
      limit 1;
      insert into public.rapidlink_assignments (
        session_id, incident_key, employee_key, offer_key, assigned_at, released_at, release_reason
      ) values (
        new.id, incident ->> 'id', incident ->> 'assignedEmployeeId', offer ->> 'id',
        coalesce(nullif(incident ->> 'acceptedAt', '')::timestamptz, (incident ->> 'createdAt')::timestamptz),
        case when incident ->> 'status' in ('CANCELLED', 'COMPLETED') then coalesce(nullif(incident ->> 'completedAt', '')::timestamptz, now()) else null end,
        case when incident ->> 'status' = 'COMPLETED' then 'completed' when incident ->> 'status' = 'CANCELLED' then 'cancelled' else null end
      );
    end if;
  end loop;

  for audit_event in select value from jsonb_array_elements(coalesce(new.state -> 'audit', '[]'::jsonb)) loop
    insert into public.rapidlink_incident_events (session_id, event_key, event_type, message, created_at)
    values (new.id, audit_event ->> 'id', audit_event ->> 'type', audit_event ->> 'message', (audit_event ->> 'createdAt')::timestamptz);
  end loop;

  return new;
end;
$$;

drop trigger if exists rapidlink_project_session_state on public.rapidlink_sessions;
create trigger rapidlink_project_session_state
after insert or update of state on public.rapidlink_sessions
for each row execute function private.rapidlink_project_session_state();

revoke all on function private.rapidlink_project_session_state() from public, anon, authenticated;

create or replace function public.rapidlink_commit_session_action(
  p_code text,
  p_expected_version bigint,
  p_state jsonb,
  p_action_id text,
  p_action_type text,
  p_action_payload jsonb
)
returns setof public.rapidlink_sessions
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target public.rapidlink_sessions%rowtype;
begin
  select * into target
  from public.rapidlink_sessions
  where code = p_code and expires_at > now()
  for update;

  if not found then
    return;
  end if;

  if exists (
    select 1 from public.rapidlink_action_log
    where session_id = target.id and action_id = p_action_id
  ) then
    return query select * from public.rapidlink_sessions where id = target.id;
    return;
  end if;

  if target.version <> p_expected_version then
    return;
  end if;

  update public.rapidlink_sessions
  set state = p_state,
      version = version + 1,
      updated_at = now()
  where id = target.id;

  insert into public.rapidlink_action_log (session_id, action_id, action_type, action_payload)
  values (target.id, p_action_id, p_action_type, coalesce(p_action_payload, '{}'::jsonb));

  return query select * from public.rapidlink_sessions where id = target.id;
end;
$$;

revoke all on function public.rapidlink_commit_session_action(text, bigint, jsonb, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.rapidlink_commit_session_action(text, bigint, jsonb, text, text, jsonb) to service_role;

-- Backfill existing rooms into the operational tables without changing their state.
update public.rapidlink_sessions set state = state;
