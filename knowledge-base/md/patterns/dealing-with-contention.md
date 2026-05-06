🔒 **Contention** occurs when multiple processes compete for the same resource simultaneously. This could be booking the last concert ticket, bidding on an auction item, or any similar scenario. Without proper handling, you get race conditions, double-bookings, and inconsistent state. This pattern walks you through solutions from simple database transactions to more complex distributed coordination, showing when optimistic concurrency beats pessimistic locking and how to scale beyond single-node constraints.

## The Problem

Consider buying concert tickets online. There's 1 seat left for The Weeknd concert. Alice and Bob both want this last seat and click "Buy Now" at exactly the same moment. Without proper coordination, here's what happens:

- Alice's request reads: "1 seat available"

- Bob's request reads: "1 seat available" (both reads happen before either write)

- Alice's request checks if 1 ≥ 1 (yes, there is a seat available), proceeds to payment

- Bob's request checks if 1 ≥ 1 (yes, there is a seat available), proceeds to payment

- Alice gets charged $500, seat count decremented to 0

- Bob gets charged $500, seat count decremented to -1

Both Alice and Bob receive confirmation emails with the exact same seat number. They both show up to the concert thinking they own Row 5, Seat 12. One of them is getting kicked out, and the venue has to issue a refund while dealing with two very angry customers.

Race Condition Timeline

The race condition happens because both Alice and Bob read the same initial state (1 seat available) before either of their updates takes effect. By the time Bob's update runs, Alice has already reduced the count to 0, but Bob's logic was based on the stale reading of 1 seat.

This race condition is fundamentally an isolation problem, not an atomicity problem. Each transaction individually succeeds (atomicity is fine), but they interfere with each other because they can see the same data concurrently. There's a gap between "check the current state" and "update based on that state" where the world can change. In that tiny window (microseconds in memory, milliseconds over a network), things break.

The problem only gets worse when you scale. With 10,000 concurrent users hitting the same resource, even small race condition windows create massive conflicts. As you continue to grow, it's likely that you'll need to coordinate across multiple nodes which adds to the complexity.

To get this right, we need some form of synchronization.

###### Problem Breakdowns with Dealing with Contention Pattern

Ticketmaster

Rate Limiter

Online Auction

## The Solution

The solution to contention problems gets more complex as your needs grow. We start with single-database solutions using atomicity and transactions, then add coordination mechanisms when concurrent access creates conflicts, and finally move to distributed coordination when multiple databases are involved.

### Single Node Solutions

When all your data exists in a single database, contention solutions are more straightforward but still have important gotchas to watch out for. Here are the possible solutions for handling contention within a single node.

#### Atomicity

Before reaching for complex coordination mechanisms, atomicity solves many contention problems. **Atomicity** means that a group of operations either all succeed or all fail. There's no partial completion. If you're transferring money between accounts, either both the debit and credit happen, or neither does.

**Transactions** are how databases provide atomicity. A transaction is a group of database operations treated as a single unit. You start with BEGIN TRANSACTION, perform your operations, and finish with COMMIT (to save changes) or ROLLBACK (to undo everything).

```
BEGIN TRANSACTION;

-- Debit Alice's account
UPDATE accounts SET balance = balance - 100 WHERE user_id = 'alice';

-- Credit Bob's account 
UPDATE accounts SET balance = balance + 100 WHERE user_id = 'bob';

COMMIT; -- Both operations succeed together
```

If anything goes wrong during this transaction, like Alice has insufficient funds, Bob's account doesn't exist, or the database crashes, the entire transaction gets rolled back. This prevents money from disappearing or appearing out of nowhere.

These examples use SQL because relational databases are well-known for their strong ACID guarantees (where the "A" in ACID stands for Atomicity). However, many databases support transactions, including NoSQL databases like MongoDB (multi-document transactions) and DynamoDB (transaction operations), as well as distributed SQL databases like CockroachDB and Google Spanner. The concepts apply regardless of the specific database technology, though the exact isolation guarantees vary between engines.

For a concert ticket purchase, atomicity ensures that multiple related operations happen together. A ticket purchase isn't just decrementing a seat count - you also need to create a ticket record:

```
BEGIN TRANSACTION;

-- Reserve the seat (only if available)
UPDATE concerts
SET available_seats = available_seats - 1
WHERE concert_id = 'weeknd_tour'
 AND available_seats > 0;

-- Create the ticket record
INSERT INTO tickets (user_id, concert_id, seat_number, purchase_time)
VALUES ('user123', 'weeknd_tour', 'A15', NOW());

COMMIT;
```

If any of these operations fail, the entire transaction rolls back. You don't end up with a seat reserved but no ticket created.

But even with this atomic transaction, there's a subtle problem that atomicity alone doesn't solve. Two people can still book the same seat. Here's why: Alice and Bob can both start their transactions simultaneously. Under the default READ COMMITTED isolation, both see available_seats = 1, both execute their UPDATE statements, and both succeed (the second transaction re-evaluates the WHERE clause against the committed state, finds available_seats = 0, and the update affects zero rows, but the INSERT still runs unless the application checks the row count).

The issue is that transactions provide atomicity within themselves, but don't prevent other transactions from reading the same data concurrently. We need coordination mechanisms to solve this.

#### Pessimistic Locking

Pessimistic locking prevents conflicts by acquiring locks upfront. The name comes from being "pessimistic" about conflicts - assuming they will happen and preventing them.

We can fix our race condition using explicit row locks:

Of course, in a real ticketing system you'd have the concept of ticket reservations to improve the user experience. But for the sake of this example, we'll keep it simple and we talk about how to handle reservations in a later section.

```
BEGIN TRANSACTION;

-- Lock the row first to prevent race conditions
SELECT available_seats FROM concerts
WHERE concert_id = 'weeknd_tour'
FOR UPDATE;

-- Safely update only if seats are available
UPDATE concerts
SET available_seats = available_seats - 1
WHERE concert_id = 'weeknd_tour'
 AND available_seats > 0;

-- Application checks affected row count here.
-- If 0 rows updated, ROLLBACK instead of inserting.

-- Create the ticket record
INSERT INTO tickets (user_id, concert_id, seat_number, purchase_time)
VALUES ('user123', 'weeknd_tour', 'A15', NOW());

COMMIT;
```

The FOR UPDATE clause acquires an exclusive lock on the concert row before reading. When Alice runs this code, Bob's identical transaction will block at the SELECT statement until Alice's transaction completes. This prevents both from seeing the same initial seat count and ensures only one person can check and update at a time.

The AND available_seats > 0 guard is important here. Locking the row prevents concurrent access, but it doesn't enforce business invariants. Without that check, if two transactions run back-to-back, the second one would happily decrement seats to -1. The lock serializes access; the predicate enforces correctness.

A **lock** in this context is a mechanism that prevents other database connections from accessing the same data until the lock is released. Databases like PostgreSQL and MySQL can handle thousands of concurrent connections, but locks ensure that only one connection can modify a specific row (or set of rows) at a time.

Explicit Row Locks

Performance considerations are really important when using locks. You want to lock as few rows as possible for as short a time as possible. Lock entire tables and you kill concurrency. Hold locks for seconds instead of milliseconds and you create bottlenecks. In our example, we're only locking one specific concert row briefly during the purchase.

#### Isolation Levels

Instead of explicitly locking rows with FOR UPDATE, you can let the database automatically handle conflicts by raising what's called the isolation level. **Isolation levels** control how much concurrent transactions can see of each other's changes. Think of it as how "isolated" each transaction is from seeing other transactions' work.

Most databases support four standard isolation levels (these are different options, not a progression):

- READ UNCOMMITTED - Can see uncommitted changes from other transactions (rarely used)

- READ COMMITTED - Can only see committed changes (default in PostgreSQL)

- REPEATABLE READ - Same data read multiple times within a transaction stays consistent (default in MySQL)

- SERIALIZABLE - Strongest isolation, transactions appear to run one after another

With the default READ COMMITTED, our concert ticket race condition is still possible because both Alice and Bob can read "1 seat available" and proceed with their updates. In PostgreSQL, REPEATABLE READ would actually catch this: the second transaction to update the row gets aborted with a serialization error, forcing a retry. But this behavior varies by database engine, so don't rely on it universally. The SERIALIZABLE isolation level provides the strongest guarantee, making transactions appear to run one at a time:

```
-- Set isolation level for this transaction
BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE;

UPDATE concerts
SET available_seats = available_seats - 1
WHERE concert_id = 'weeknd_tour'
 AND available_seats > 0;

-- Create the ticket record
INSERT INTO tickets (user_id, concert_id, seat_number, purchase_time)
VALUES ('user123', 'weeknd_tour', 'A15', NOW());

COMMIT;
```

With SERIALIZABLE, the database automatically detects conflicts and aborts one transaction if they would interfere with each other. The aborted transaction must retry. You still need the available_seats > 0 predicate because SERIALIZABLE prevents conflicting concurrent modifications, but won't stop a single transaction from decrementing below zero on its own.

Isolation Levels

The tradeoff is that SERIALIZABLE isolation is much more expensive than explicit locks. It requires the database to track all reads and writes to detect potential conflicts, and transaction aborts waste work that must be redone. Explicit locks give you precise control over what gets locked and when, making them more efficient for scenarios where you know exactly which resources need coordination.

#### Optimistic Concurrency Control

Pessimistic locking assumes conflicts will happen and prevents them upfront. **Optimistic concurrency control (OCC)** takes the opposite approach in that it assumes conflicts are rare and detects them after they occur.

The performance benefit is significant. Instead of blocking transactions waiting for locks, you let them all proceed and only retry the ones that conflict. Under low contention, this eliminates locking overhead entirely.

The pattern is simple, you can include a version number with your data. Every time you update a record, increment the version. When updating, specify both the new value and the expected current version.

```
-- Alice reads: concert has 1 seat, version 42
-- Bob reads: concert has 1 seat, version 42

-- Alice tries to update first:
BEGIN TRANSACTION;
UPDATE concerts 
SET available_seats = available_seats - 1, version = version + 1
WHERE concert_id = 'weeknd_tour' 
 AND version = 42; -- Expected version

INSERT INTO tickets (user_id, concert_id, seat_number, purchase_time)
VALUES ('alice', 'weeknd_tour', 'A15', NOW());
COMMIT;

-- Alice's update succeeds, seats = 0, version = 43

-- Bob tries to update:
BEGIN TRANSACTION;
UPDATE concerts
SET available_seats = available_seats - 1, version = version + 1
WHERE concert_id = 'weeknd_tour'
 AND version = 42; -- Stale version!

-- Bob's UPDATE affects 0 rows (version mismatch).
-- The application MUST check the affected row count.
-- If 0 rows updated: ROLLBACK (don't insert the ticket!)
-- SQL won't raise an error on its own for a WHERE that matches nothing.
ROLLBACK;
```

This is a subtle but important point. The UPDATE with a stale version won't raise a database error. It just silently updates zero rows. Your application code must check how many rows were affected and roll back the transaction if zero rows matched. Otherwise the INSERT would still run, creating a ticket without actually reserving a seat.

When Bob's update affects zero rows, he knows someone else modified the record. He can re-read the current state, check if seats are still available, and retry with the new version number. If seats are gone, he gets a clear "sold out" message instead of a mysterious failure.

Importantly, the "version" doesn't have to be a separate column. You can use existing data that naturally changes when the record is updated. In our concert example, the available seats count itself serves as the version. Here's how it works:

```
-- Alice reads: 1 seat available
-- Bob reads: 1 seat available

-- Alice tries to update first:
BEGIN TRANSACTION;
UPDATE concerts 
SET available_seats = available_seats - 1
WHERE concert_id = 'weeknd_tour' 
 AND available_seats = 1; -- Expected current value

INSERT INTO tickets (user_id, concert_id, seat_number, purchase_time)
VALUES ('alice', 'weeknd_tour', 'A15', NOW());
COMMIT;

-- Alice's update succeeds, seats now = 0

-- Bob tries to update:
BEGIN TRANSACTION;
UPDATE concerts
SET available_seats = available_seats - 1
WHERE concert_id = 'weeknd_tour'
 AND available_seats = 1; -- Stale value!

-- Again, check affected row count: 0 rows = conflict detected.
-- Application must ROLLBACK and not proceed with the INSERT.
ROLLBACK;
```

Same as before, your application must check the affected row count after the UPDATE. If zero rows matched, someone else already changed the data and you need to roll back or retry.

Be careful when choosing what to use as your "version." Using mutable business values (like account balances or stock counts) is risky because of the ABA problem, where a value can change from A to B and back to A, making it look like nothing changed. For example, if a bank balance goes from $100 to $50 and back to $100 between your read and write, your optimistic check would pass even though the account state changed meaningfully. A dedicated, monotonically increasing version column is the safest approach. Use business values as the version only when you're certain they change in one direction (like a monotonically increasing bid amount in an auction).

This approach makes sense when conflicts are uncommon. For most e-commerce scenarios, the chance of two people buying the exact same item at the exact same moment is low. The occasional retry is worth avoiding the overhead of pessimistic locking.

### Multiple Nodes

All the approaches we've covered so far work within a single database. But what happens when you need to coordinate updates across multiple databases? This is where things get significantly more complex.

If you identify that your system needs strong consistency guarantees during high-contention scenarios, you should do all you can to keep the relevant data in a single database. Nine times out of ten, this is entirely possible and avoids the need for distributed coordination, which can get ugly fast.

Consider a bank transfer where Alice and Bob have accounts in different databases. Maybe your bank grew large enough that you had to shard user accounts across multiple databases. Alice's account lives in Database A while Bob's account lives in Database B. Now you can't use a single database transaction to handle the transfer. Database A needs to debit $100 from Alice's account while Database B needs to credit $100 to Bob's account. Both operations must succeed or both must fail. If Database A debits Alice but Database B fails to credit Bob, money disappears from the system.

You have several options for distributed coordination, each with different trade-offs:

#### Two-Phase Commit (2PC)

The classic solution is two-phase commit, where your transfer service acts as the coordinator managing the transaction across multiple database participants. The coordinator (your service) asks all participants to prepare the transaction in the first phase, then tells them to commit or abort in the second phase based on whether everyone successfully prepared.

Two-Phase Commit

Critically, the coordinator must write to a persistent log before sending any commit or abort decisions. This log records which participants are involved and the current state of the transaction. Without this log, coordinator crashes create unrecoverable situations where participants don't know whether to commit or abort their prepared transactions.

The prepare phase holds locks on Alice's and Bob's account rows, blocking any other operations on those accounts. If your coordinator service crashes between prepare and commit, databases are left in an uncertain state, waiting for a decision that may never come. This is 2PC's biggest weakness: participants that have prepared are blocked until the coordinator recovers and resolves the transaction. This is why the coordinator's persistent log is so critical, and why 2PC requires careful attention to coordinator availability.

The prepare phase is where each database does all the work except the final commit. In a true 2PC implementation, databases use a PREPARE TRANSACTION command (or equivalent) that makes the prepared state durable, surviving even database restarts. Database A verifies Alice has sufficient funds, places a hold on $100, and prepares the transaction. Database B verifies Bob's account exists, prepares to add $100, and also prepares. These prepared transactions are persistent and will survive crashes, which is what makes 2PC different from just leaving regular transactions open.

If both databases prepare successfully, your service tells them to commit their prepared transactions. If either fails to prepare, both abort.

Two-phase commit guarantees atomicity across multiple systems, but it's expensive and has a well-known blocking problem. If your coordinator crashes between prepare and commit, prepared transactions sit waiting for a decision, holding their locks. Other transactions on those rows are blocked until the coordinator recovers. Network partitions cause the same blocking behavior: participants can't make progress until they hear from the coordinator. The key insight is that 2PC preserves consistency (you won't get an inconsistent state), but at the cost of availability. Partitions cause blocking, not data corruption.

#### Distributed Locks

For simpler coordination needs, you can use distributed locks. Instead of coordinating complex transactions, you just ensure only one process can work on a particular resource at a time across your entire system.

For our bank transfer, you could acquire locks on both Alice's and Bob's account IDs before starting any operations. This prevents concurrent transfers from interfering with each other:

Distributed locks can be implemented with several technologies, each with different characteristics:

**Redis with TTL** - Redis provides atomic operations with automatic expiration, making it ideal for distributed locks. The SET command with NX (only set if not exists) and expiration atomically creates a lock that Redis will automatically remove after the TTL expires (the NX flag is critical - without it, a second process could overwrite an existing lock). This eliminates the need for cleanup jobs since Redis handles expiration in the background. The lock is distributed because all your application servers can access the same Redis instance and see consistent state. When the lock expires or is explicitly deleted, the resource becomes available again. The advantage is speed and simplicity. Redis operations are very fast and the TTL handles cleanup automatically. The disadvantage is that Redis becomes a single point of failure, and you need to handle scenarios where Redis is unavailable.

**Database columns** - You can implement distributed locks using your existing database by adding status and expiration columns to track which resources are locked. This approach keeps everything in one place and leverages your database's ACID properties to ensure atomicity when acquiring locks. A background job periodically cleans up expired locks, though you need to handle race conditions between the cleanup job and users trying to extend their locks. The advantage is consistency with your existing data and no additional infrastructure. The disadvantage is that database operations are slower than cache operations, and you need to implement and maintain cleanup logic.

**ZooKeeper/etcd** - These are purpose-built coordination services designed specifically for distributed systems. They provide strong consistency guarantees even during network partitions and leader failures. ZooKeeper uses ephemeral nodes that automatically disappear when the client session ends, providing natural cleanup for crashed processes. Both systems use consensus algorithms (Raft for etcd, ZAB for ZooKeeper) to maintain consistency across multiple nodes.

The advantage is robustness. These systems are designed to handle the complex failure scenarios that Redis and database approaches struggle with. The disadvantage is operational complexity, as you need to run and maintain a separate coordination cluster.

Distributed locks aren't just for technical coordination either, they can dramatically improve user experience by preventing contention before it happens. Instead of letting users compete for the same resource, create intermediate states that give temporary exclusive access.

Consider Ticketmaster seat reservations. When you select a seat, it doesn't immediately go from "available" to "sold." Instead, it goes to a "reserved" state that gives you time to complete payment while preventing others from selecting the same seat. The contention window shrinks from the entire purchase process (5 minutes) to just the reservation step (milliseconds).

The same pattern appears everywhere. Uber sets driver status to "pending_request," e-commerce sites put items "on hold" in shopping carts, and meeting room booking systems create temporary holds.

One important consideration with TTL-based distributed locks is what happens when a lock expires while the holder is still working (maybe due to a GC pause, network delay, or the process just being slow). Another process can acquire the lock. Now two processes think they hold the lock. To protect against this, use **fencing tokens**: a monotonically increasing number issued with each lock acquisition. The storage layer validates that incoming writes carry a token at least as large as the last one it saw, rejecting stale writes from expired lock holders.

The advantage of distributed locks is simplicity compared to complex transaction coordination. The disadvantage is that they can become bottlenecks under high contention, and you need to handle lock timeouts and failure scenarios carefully.

#### Saga Pattern

The saga pattern takes a different approach. Instead of trying to coordinate everything atomically like 2PC, it breaks the operation into a sequence of independent steps that can each be undone if something goes wrong.

Think of it like this. Instead of holding both Alice's and Bob's accounts locked while coordinating, you just do the operations one by one. First, debit Alice's account and commit that transaction immediately. Then, credit Bob's account and commit that transaction. If the second step fails, you "compensate" by crediting Alice's account back to undo the first step.

For our bank transfer example

- Step 1 - Debit $100 from Alice's account in Database A, commit immediately

- Step 2 - Credit $100 to Bob's account in Database B, commit immediately

- Step 3 - Send confirmation notifications

If Step 2 fails (Bob's account doesn't exist), you run the compensation for Step 1. You credit $100 back to Alice's account. If Step 3 fails, you compensate both Step 2 (debit Bob's account) and Step 1 (credit Alice's account).

Each step is a complete, committed transaction. There are no long-running open transactions holding locks across network calls like in 2PC.

That said, sagas still need a durable coordinator (often called an orchestrator) to track which steps have completed. If the coordinator crashes after Step 1 but before Step 2, you need a way to resume. In practice, this is handled by workflow engines like Temporal, Cadence, or even a simple state machine backed by a database. The orchestrator persists the saga's progress, so after a crash it can pick up where it left off and either complete the remaining steps or run compensations.

The important tradeoff is that during saga execution, the system is temporarily inconsistent. After Step 1 completes, Alice's account is debited but Bob's account isn't credited yet. Other processes might see Alice's balance as $100 lower during this window. If someone checks the total money in the system, it appears to have decreased temporarily.

This eventual consistency is what makes sagas practical. You avoid the blocking problem of 2PC by accepting brief inconsistency. You handle this by designing your application to understand these intermediate states. For example, you might show transfers as "pending" until all steps complete.

## Choosing the Right Approach

Keep in mind, like with much of system design, there isn't always a clear-cut answer. You'll need to consider the tradeoffs of each approach based on your specific use case and make the appropriate justification for your choice.

**Start here. Can you keep all the contended data in a single database?** If yes, use pessimistic locking or optimistic concurrency based on your conflict frequency.

**Single database, high contention:** Pessimistic locking with explicit locks (FOR UPDATE). This provides predictable performance, is simple to reason about, and handles worst-case scenarios well.

**Single database, low contention:** Optimistic concurrency control using existing columns as versions. This provides better performance when conflicts are rare and has no blocking.

**Multiple databases, must be atomic:** Distributed transactions (2PC for strong consistency, Sagas for resilience). Use only when you absolutely need atomicity across systems.

**User experience matters:** Distributed locks with reservations to prevent users from entering contention scenarios. This is great for ticketing, e-commerce, and any user-facing competitive flows.

ApproachUse WhenAvoid WhenTypical LatencyComplexity**Pessimistic Locking**High contention, critical consistency, single databaseLow contention, high throughput needsLow (single DB query)Low**SERIALIZABLE Isolation**Need automatic conflict detection, can't identify specific locksPerformance critical, high contentionMedium (conflict detection overhead)Low**Optimistic Concurrency**Low contention, high read/write ratio, performance criticalHigh contention, can't tolerate retriesLow (when no conflicts)Medium**Distributed Transactions**Must have atomicity across systems, can tolerate complexityHigh availability requirements, performance criticalHigh (network coordination)Very High**Distributed Locks**User-facing flows, need reservations, simpler than 2PCNo alternatives available, purely technical coordinationLow (simple status updates)Medium

Flow Chart

When in doubt, start with pessimistic locking in a single database. It's simple, predictable, and you can always improve it later.

## When to Use in Interviews

Don't wait for the interviewer to ask about contention. When you see scenarios where multiple processes compete for the same resource, call it out and suggest coordination mechanisms. This is typically when you determine during your non-functional requirements that your system requires strong consistency.

### Recognition Signals

Here are some bang on examples of when you might need to use contention patterns:

**Multiple users competing for limited resources** such as concert tickets, auction bidding, flash sale inventory, or matching drivers with riders

**Prevent double-booking or double-charging** in scenarios like payment processing, seat reservations, or meeting room scheduling

**Ensure data consistency under high concurrency** for operations like account balance updates, inventory management, or collaborative editing

**Handle race conditions in distributed systems** in any scenario where the same operation might happen simultaneously across multiple servers and where the outcome is sensitive to the order of operations.

### Common Interview Scenarios

This shows up A LOT in common interview questions. It's one of the most popular patterns and interviewers love to ask about it. Here are some examples of places where you might need to use contention patterns:

**Online Auction Systems** - Perfect for demonstrating optimistic concurrency control because multiple bidders compete for the same item. You can use the current high bid as the "version" (since bids only go up, no ABA risk) and only accept new bids if they're higher than the expected current bid.

**Ticketmaster/Event Booking** - While this seems like a classic pessimistic locking scenario for seat selection, temporary reservations are actually the bigger win. When users select seats, you immediately reserve them with a 10-minute TTL using a distributed lock, which prevents the terrible UX of users filling out payment info only to find the seat was taken by someone else.

**Banking/Payment Systems** - Great place to showcase distributed transactions since account transfers between different banks or services need atomic operations across multiple systems. You should start with the saga pattern for resilience and mention 2PC only if the interviewer pushes for strict consistency requirements.

**Ride Sharing Dispatch** - Temporary status reservations shine here. You can set driver status to "pending_request" when sending ride requests, which prevents multiple simultaneous requests to the same driver. Use either a cache with TTL for automatic cleanup when drivers don't respond within 10 seconds, or database status fields with periodic cleanup jobs.

**Flash Sale/Inventory Systems** - Perfect for demonstrating a mix of approaches. You can use optimistic concurrency with a dedicated version column for inventory updates, combined with temporary cart "holds" (using distributed locks with TTL) to improve user experience and reduce contention at checkout.

**Yelp/Review Systems** - A good example of optimistic concurrency control. When users submit reviews, you need to update the business's average rating. Multiple concurrent reviews for the same restaurant create contention, so you can use a dedicated version column and only update if the version matches what you read. This prevents rating calculations from getting corrupted when reviews arrive simultaneously.

The best candidates identify contention problems before they're asked. When designing any system with shared resources, immediately address coordination:

"This auction system will have multiple bidders competing for items, so I'll use optimistic concurrency control with the current high bid as my version check."

"For the ticketing system, I want to avoid users losing seats after filling out payment info, so I'll implement seat reservations with a 10-minute timeout."

"Since we're sharding user accounts across databases, transfers between different shards will need distributed transactions. I'll use the saga pattern for resilience."

### When NOT to overcomplicate

Don't reach for complex coordination mechanisms when simpler solutions work.

A common mistake I see is candidates reaching for distributed locks (Redis, etc) when a simple database transaction with row locking or OCC is sufficient. Keep in mind that adding new components adds system complexity and introduces new failure modes so do what you can to avoid them.

**Low contention scenarios** where conflicts are rare (like updating product descriptions where only admins can edit) can use basic optimistic concurrency with retry logic. Don't implement elaborate locking schemes when simple retry logic handles the occasional conflict.

**Single-user operations** like personal todo lists, private documents, or user preferences have no contention, so no coordination is needed.

**Read-heavy workloads** where most operations are reads with occasional writes can use simple optimistic concurrency to handle the rare write conflicts without impacting read performance.

## Common Deep Dives

Interviewers love to dig into edge cases and failure scenarios. Here are the follow-up questions you'll hear most often.

### "How do you prevent deadlocks with pessimistic locking?"

Consider a bank transfer between two accounts. Alice wants to transfer $100 to Bob, while Bob simultaneously wants to transfer $50 to Alice. Transaction A needs to debit Alice's account and credit Bob's account. Transaction B needs to debit Bob's account and credit Alice's account. Transaction A locks Alice's account first, then tries to lock Bob's account. Transaction B locks Bob's account first, then tries to lock Alice's account. Both transactions wait forever for the other to release their lock.

Deadlock

This deadlock happens because the transactions acquire locks in different orders. The business logic doesn't care about order, it just wants to update both users when they interact. But databases can't read your mind about which locks are safe to acquire simultaneously.

The standard solution is ordered locking, which means always acquiring locks in a consistent order regardless of your business logic flow. Sort all the resources you need to lock by some deterministic key (like user ID or database primary key) before acquiring any locks. If you need to lock users 123 and 456, always lock 123 first even if your business logic processes 456 first. This prevents circular waiting because all transactions follow the same acquisition order.

For a transfer between users 456 and 123, always lock user 123 first regardless of who initiated the transfer. This is critical — you must sort all participants by the same key, not "lock the initiator first." If Alice (ID 456) transfers to Bob (ID 123), lock Bob first because 123 < 456. If Bob transfers to Alice, still lock Bob first. The exact ordering scheme doesn't matter as long as it's globally consistent across all transactions in your system.

As a fallback, database timeout configurations serve as your safety net when ordered locking isn't practical or when you miss edge cases. Set transaction timeouts so deadlocked transactions get killed after a reasonable wait period and can retry with proper ordering. Most modern databases also have automatic deadlock detection that kills one transaction when cycles are detected, but this should be your fallback, not your primary strategy.

### "What if your coordinator service crashes during a distributed transaction?"

This is the classic 2PC failure scenario. Databases are sitting with prepared transactions, waiting for commit or abort instructions that never come. Those transactions hold locks on resources, potentially blocking other operations indefinitely.

2PC Failure

Production systems handle this with coordinator failover and transaction recovery. When a new coordinator starts up, it reads persistent logs to determine which transactions were in-flight and completes them. Most enterprise transaction managers handle this automatically, but you still need to design for coordinator high availability and maintain transaction state across failures.

Sagas are more resilient here (as discussed earlier) because they don't hold locks across network calls. Coordinator failure just pauses progress rather than leaving participants in limbo.

### "How do you handle the ABA problem with optimistic concurrency?"

Sneaky question that tests deeper understanding. The ABA problem occurs when a value changes from A to B and back to A between your read and write. Your optimistic check sees the same value and assumes nothing changed, but important state transitions happened.

Consider a review system like Yelp, where users can review businesses and each business tracks an average rating so we don't need to recalculate it each time. A restaurant starts with 4.0 stars and 100 reviews. Two new reviews come in simultaneously - one gives 5 stars, another gives 3 stars. Both reviews see the current average as 4.0 and calculate the new average. Due to the math, the final average might still end up at 4.0 stars, but now with 102 reviews. If you use just the average rating as your "version," both updates would see the same 4.0 value. One succeeds, but the other also passes the optimistic check (since 4.0 == 4.0), causing you to miss a review or miscalculate the count.

The safest solution is a dedicated version column that increments on every update, regardless of whether any business data changed. Your update becomes "set new average and increment version, but only if the version matches what I read."

```
-- Use a dedicated version column for safety
UPDATE restaurants
SET avg_rating = 4.1, review_count = review_count + 1, version = version + 1
WHERE restaurant_id = 'pizza_palace'
 AND version = 42; -- Expected current version
```

You might be tempted to use a business value like review_count as your version instead. That works if the value only ever increases, but breaks down if reviews can be deleted (the count could go from 100 to 99 and back to 100, creating an ABA situation). A dedicated version column avoids this entirely.

### "What about performance when everyone wants the same resource?"

This is the hot partition or celebrity problem, where your carefully designed distributed system suddenly has everyone hammering the same single resource. Think about what happens when a celebrity joins Twitter and millions of users try to follow them simultaneously, or when a rare collectible drops on eBay and thousands of people bid on the same item, or when Taylor Swift announces a surprise concert and everyone tries to buy tickets at the exact same time.

The fundamental issue is that normal scaling strategies break down when demand concentrates on a single point. Sharding doesn't help because you can't split one Taylor Swift concert across multiple databases because everyone wants that specific resource. Load balancing doesn't help because all the load balancer does is distribute requests to different servers that then compete for the same database row. Even read replicas don't help because the bottleneck is on the writes.

Your first strategy should be questioning whether you can change the problem itself rather than throwing more infrastructure at it. Maybe instead of one auction item, you actually have 10 identical items and can run separate auctions for each. Maybe instead of requiring immediate consistency for social media interactions, you can make likes and follows eventually consistent - users won't notice if their follow takes a few seconds to appear on the celebrity's follower count.

Queue-Based Serialization

For cases where you truly need strong consistency on a hot resource, implement queue-based serialization. Put all requests for that specific resource into a dedicated queue that gets processed by a single worker thread. This eliminates contention entirely by making operations sequential rather than concurrent. The queue acts as a buffer that can absorb traffic spikes while the worker processes requests at a sustainable rate.

The tradeoff is latency. Users might wait longer for their requests to be processed. But this is often better than the alternative of having your entire system grind to a halt under the contention.

## Conclusion

Contention handling matters for reliable systems, but the right approach isn't what most engineers expect. You should exhaust every single-database solution before even considering distributed coordination, since modern databases like PostgreSQL can handle tens of terabytes and thousands of concurrent connections. This covers the vast majority of applications you'll ever build, and the complexity jump to distributed coordination comes with a lot of overhead and often worse performance.

You should stay within a single database as long as possible because both pessimistic locking and optimistic concurrency give you simple, battle-tested solutions with ACID guarantees. Pessimistic locking handles high contention predictably, while optimistic concurrency delivers excellent performance when conflicts are rare. Only move to distributed coordination when you've truly outgrown vertical scaling or need geographic distribution, which happens much later than most engineers think.

Good system designers keep their data together as long as possible and pick the right coordination pattern for their consistency requirements. The simplest solution that works is almost always the right one.

###### Test Your Knowledge

Take a quick 15 question quiz to test what you've learned.

Start Quiz

Mark as read

Next: Multi-step Processes

## Comments

Comment

Anonymous
Posting as Abhishek Agarwal

###### The best mocks on the market.

Now up to 10% off

Learn More

Reading Progress

On This Page

The Problem

The Solution

Single Node Solutions

Multiple Nodes

Choosing the Right Approach

When to Use in Interviews

Recognition Signals

Common Interview Scenarios

When NOT to overcomplicate

Common Deep Dives

"How do you prevent deadlocks with pessimistic locking?"

"What if your coordinator service crashes during a distributed transaction?"

"How do you handle the ABA problem with optimistic concurrency?"

"What about performance when everyone wants the same resource?"

Conclusion

#### Schedule a mock interview

Meet with a FAANG senior+ engineer or manager and learn exactly what it takes to get the job.

Schedule a Mock Interview

###### Questions

Meta SWE Interview QuestionsAmazon SWE Interview QuestionsGoogle SWE Interview QuestionsOpenAI SWE Interview QuestionsEngineering Manager (EM) Interview Questions

###### Learn

Learn System DesignLearn DSALearn BehavioralLearn ML System DesignLearn Low Level DesignGuided Practice

###### Links

FAQPricingGift Mock InterviewsGift PremiumBecome a CoachOur CoachesHello Interview Premium

###### Legal

Terms and ConditionsPrivacy PolicySecurity

###### Contact

About UsProduct Support
7511 Greenwood Ave North
Unit #4238 Seattle
WA 98103

© 2026 Optick Labs Inc. All rights reserved.

 

Mark as read