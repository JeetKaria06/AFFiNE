# Database & Architecture Documentation

## Overview

The AFFiNE backend server uses a combination of **PostgreSQL** (via Prisma ORM) for persistent storage and **Redis** for caching, session management, real-time collaboration, and job queues. The application logic is built with **NestJS**.

## Redis Architecture

Redis is used extensively for transient state and inter-service communication. The application configures multiple Redis instances (logical databases) to isolate different workloads.

### Redis Instances

The following Redis clients are instantiated in `src/base/redis/instances.ts`:

1.  **CacheRedis** (DB 0)
    - **Purpose**: General application caching.
    - **Usage**: Used by `Cache` service (`src/base/cache/instances.ts`).
    - **Logic**: Standard key-value storage for caching expensive computations or frequent database lookups (e.g., invite links).

2.  **SessionRedis** (DB 2)
    - **Purpose**: User session storage and distributed locking.
    - **Usage**:
      - **Sessions**: `SessionCache` service (`src/base/cache/instances.ts`). Stores user session data.
      - **Locking**: `Locker` service (`src/base/mutex/locker.ts`). Implements distributed locks using `EVAL` scripts with `SET NX EX` to ensure atomic operations across replicas.

3.  **SocketIoRedis** (DB 3)
    - **Purpose**: Socket.IO Adapter for scaling WebSocket connections.
    - **Usage**: `SocketIoAdapter` (`src/base/websocket/adapter.ts`).
    - **Logic**: Uses `@socket.io/redis-adapter` for Pub/Sub. This allows broadcasting events (like document updates) to clients connected to different backend server instances.

4.  **QueueRedis** (DB 4)
    - **Purpose**: Job Queue backing store.
    - **Usage**: `JobModule` (`src/base/job/queue/index.ts`) using `BullMQ`.
    - **Logic**: Stores job data and processing states for background tasks.
    - **Queues**: Defined in `src/base/job/queue/def.ts`:
      - `nightly`: Maintenance tasks.
      - `notification`: Sending emails and notifications.
      - `doc`: Document processing.
      - `copilot`: AI/Copilot tasks.
      - `indexer`: Search indexing.

## Database Architecture (PostgreSQL)

The database schema is defined in `schema.prisma`. Access is abstracted via the `Models` layer (`src/models`), which wraps Prisma Client operations.

### 1. Authentication & Users

Managed by `src/core/auth` and `src/core/user`.

**Tables:**

- **`User`**: Core user profile (name, email, password, avatar).
  - _Key Columns_: `email` (unique), `password` (hashed, nullable for OAuth), `emailVerifiedAt`.
- **`ConnectedAccount`**: OAuth accounts linked to users (Google, GitHub, etc.).
- **`Session`**, **`UserSession`**: Session management. `UserSession` links `User` to `Session`.
- **`VerificationToken`**, **`MagicLinkOtp`**: Temporary tokens for email verification and magic link login.
- **`AccessToken`**: For API access tokens.

**Key Use Cases:**

- **Sign Up/In**: `AuthService` creates/verifies `User` and `UserSession`.
- **Session Management**: `AuthService` checks cookies against `UserSession` to authenticate requests.

### 2. Workspaces & Permissions

Managed by `src/core/workspaces`.

**Tables:**

- **`Workspace`**: Workspace metadata (id, public status, features enabled).
- **`WorkspaceUserRole`**: Maps `User` to `Workspace` with roles (Owner, Admin, Collaborator).
  - _Key Columns_: `type` (role ID), `status` (Pending/Accepted).
- **`WorkspaceDoc`**: Metadata for documents within a workspace (title, public status).
- **`WorkspaceDocUserRole`**: Granular permissions for specific docs.
- **`WorkspaceFeature`**, **`UserFeature`**: Feature flags/entitlements.
- **`WorkspaceAdminStats`**: Aggregated statistics (member count, blob size) for admin dashboards.

**Key Use Cases:**

- **Access Control**: `PermissionService` checks `WorkspaceUserRole` to authorize actions.
- **Team Management**: `WorkspaceService` handles invitations (`WorkspaceUserRole` creation with `Pending` status) and seat allocation.

### 3. Synchronization & Documents

Managed by `src/core/sync` and `src/core/doc`. This is the core of the collaboration engine.

**Tables:**

- **`Snapshot`**: Stores the latest state of a document.
  - _Key Columns_: `blob` (Binary data, likely Yjs encoded state), `state` (Vector state).
- **`Update`**: Incremental updates to documents.
  - _Key Columns_: `blob` (Binary update delta).
- **`SnapshotHistory`**: Historical snapshots for version recovery.
- **`Blob`**: Storage for large binary assets (images, files) associated with docs.

**Key Use Cases:**

- **Real-time Sync**: `SpaceSyncGateway` receives updates via WebSockets. It pushes them to `Update` table and broadcasts to other clients via Redis.
- **Document Storage**: `DocWriter` saves new docs or updates existing ones by writing to `Snapshot` and `Update` tables. Binary data handling (`y-octo`) is crucial here.

### 4. AI & Copilot

Managed by `src/plugins/copilot` and `src/models`.

**Tables:**

- **`AiSession`**: Represents a chat session with AI.
- **`AiSessionMessage`**: Messages within a session (User queries, AI responses).
- **`AiPrompt`**, **`AiPromptMessage`**: System prompts and templates.
- **`AiContext`**, **`AiContextEmbedding`**: Context for RAG (Retrieval-Augmented Generation). Stores vector embeddings.
- **`AiWorkspaceEmbedding`**, **`AiWorkspaceFileEmbedding`**: Vector embeddings for workspace content to enable semantic search.
- **`AiJobs`**: Tracks status of long-running AI tasks (e.g., transcription).

**Key Use Cases:**

- **Chat**: Storing conversation history in `AiSession`/`AiSessionMessage`.
- **Semantic Search**: Querying `*Embedding` tables (using `pgvector` extension) to find relevant context for AI responses.

### 5. Billing & Subscriptions

Managed by `src/plugins/payment`.

**Tables:**

- **`Subscription`**: User/Workspace subscriptions (Plan, Recurring interval, Stripe/RevenueCat IDs).
- **`Invoice`**: Billing processing records.
- **`UserStripeCustomer`**: Mapping between internal User ID and Stripe Customer ID.
- **`License`**, **`InstalledLicense`**: For self-hosted license management.

**Key Use Cases:**

- **Subscription Check**: Verifying if a user/workspace has an active `Subscription` before enabling premium features.
- **Webhooks**: Handling Stripe/RevenueCat webhooks to update `Subscription` status.

## Codebase Entry Points

- **Database Access**: `src/models/*` (Abstraction over Prisma).
- **Redis Access**: `src/base/redis/instances.ts` (Direct Redis clients).
- **Sync Logic**: `src/core/sync/gateway.ts` (WebSocket Gateway).
- **Document Logic**: `src/core/doc/writer.ts`, `src/core/doc/reader.ts`.
- **Auth Logic**: `src/core/auth/service.ts`.
