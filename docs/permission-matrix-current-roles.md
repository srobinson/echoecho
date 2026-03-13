# Permission Matrix (Current Role Names)

Date: 2026-03-13

## Purpose

Define a concrete permission matrix using the existing role names:

- `admin`
- `om_specialist`
- `volunteer`
- `student`

This intentionally avoids a role rename. The split is by capability and surface, not vocabulary.

## Product Interpretation Of Roles

### Student

- End-user navigation only
- Signs in anonymously
- Consumes published guidance

### Volunteer

- Field router / route recorder
- Walks routes
- Captures route truth, landmarks, hazards, and corrections
- Does not govern campuses or publish

### OM Specialist

- Elevated operational author
- Can do everything a volunteer can do
- Can create and refine route content more broadly
- Can prepare work for admin review
- Does not have final governance over users and system-wide publishing policy

### Admin

- Governance role
- Owns campuses, buildings, interiors, users, review, publishing, and oversight

## Surface Ownership

### Student App

- `student`

### Volunteer / OM Specialist Mobile Surface

- `volunteer`
- `om_specialist`
- `admin` may have access temporarily, but it should not be the primary admin surface long-term

### Admin Web Surface

- `admin`
- selected `om_specialist` access for authoring workflows where explicitly allowed

## Permission Matrix

Legend:

- `yes`
- `limited`
- `no`

### Authentication And Access

| Capability | admin | om_specialist | volunteer | student |
|---|---:|---:|---:|---:|
| Sign in to operational surfaces | yes | yes | yes | no |
| Anonymous sign-in | no | no | no | yes |
| Access student app | limited | limited | limited | yes |
| Access volunteer / `om_specialist` mobile workflows | yes | yes | yes | no |
| Access admin web workflows | yes | limited | no | no |

Notes:

- `student` should be anonymous-first.
- If authenticated students ever exist later, treat that as a separate product decision.

### Campus And Building Governance

| Capability | admin | om_specialist | volunteer | student |
|---|---:|---:|---:|---:|
| Create campus | yes | no | no | no |
| Replace campus boundary | yes | no | no | no |
| Delete campus | yes | no | no | no |
| Create building | yes | limited | no | no |
| Edit building / entrances | yes | limited | no | no |
| Create interior floors/graph | yes | limited | no | no |
| View campus/building context | yes | yes | yes | limited |

Notes:

- `om_specialist` can be granted limited structural authoring if needed, but `admin` owns governance.
- `volunteer` should be able to see structural context without owning it.

### Route Authoring And Validation

| Capability | admin | om_specialist | volunteer | student |
|---|---:|---:|---:|---:|
| Create draft route from map | yes | yes | limited | no |
| Record / walk route in field | yes | yes | yes | no |
| Edit draft route geometry | yes | yes | limited | no |
| Edit landmarks / hazards / waypoint prompts | yes | yes | yes | no |
| Submit walked route for review | yes | yes | yes | no |
| Assign route to volunteer | yes | yes | no | no |
| Review walked route | yes | limited | no | no |
| Approve route | yes | no | no | no |
| Publish route | yes | no | no | no |
| Retract / archive route | yes | limited | no | no |

Notes:

- `volunteer` should be able to create field-driven route drafts and submit them.
- `om_specialist` is the bridge role: stronger authoring than volunteer, less governance than admin.
- `admin` is the only role that should publish.

### Hazards, Landmarks, And POIs

| Capability | admin | om_specialist | volunteer | student |
|---|---:|---:|---:|---:|
| Report hazard | yes | yes | yes | no |
| Resolve / hide hazard | yes | yes | limited | no |
| Create POI | yes | yes | limited | no |
| Edit landmark guidance | yes | yes | yes | no |

Notes:

- `volunteer` should be able to report hazards and author landmark truth.
- final governance over hazard lifecycle belongs to `admin`, with some `om_specialist` flexibility.

### Users And Governance

| Capability | admin | om_specialist | volunteer | student |
|---|---:|---:|---:|---:|
| Invite `om_specialist` account | yes | no | no | no |
| Invite `volunteer` account | yes | no | no | no |
| Invite authenticated `student` account | yes | no | no | no |
| Change user role | yes | no | no | no |
| Deactivate user | yes | no | no | no |
| View user roster | yes | limited | no | no |
| View analytics | yes | limited | no | no |

## Important Policy Decisions

### Students Are Anonymous

Recommended default:

- students do not need operational profiles
- the student app uses anonymous authentication
- published student content should be accessible without an invited profile

Implication:

- user-management UI should focus on `admin`, `om_specialist`, and `volunteer`
- authenticated `student` creation is optional and should only exist if there is a concrete future need

### Admin Is The Only Publishing Authority

Even if `om_specialist` can prepare content for review, final publish authority should remain with `admin`.

### Volunteers Need Authoring Power, Not Governance Power

Volunteers should be powerful in the field and weak in governance.

That means:

- yes to route truth capture
- yes to hazard and landmark submission
- no to user management
- no to campus/building governance
- no to publishing

## Recommendation

Use this matrix as the source of truth for:

- RLS updates
- edge-function authorization
- admin web scope
- volunteer / `om_specialist` mobile scope
- future app-shell split

The key constraint is:

- keep the current role names
- split capability and product surfaces instead
