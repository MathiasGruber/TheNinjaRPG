# Coding Guidelines

These guidelines are to be followed to give some consistency to the codebase. They are developed ad hoc, and as such do not represent a full overview; further context and consistency can be adapted from the codebase itself. This guide is written also in a manner so that it can be used as instructions for AI to contribute to the codebase.

# Structure

## Permissions

Permissions & utility functions for checking permissions are stored in `utils/permissions`. If a new permission set is required, implement it here and import it both in frontend/backend as needed, so that we only have one location for controlling permissions.

# Mutation endpoints [.mutate() only]

When writing tRPC mutation endpoints, it is prefered that they are split into three sections; a section where all required data is fetches (in parallel Promise.all for efficiency), a section where all guard checks are performed (e.g. check permissions), and finally a section performing the mutation (also execute queries in Promise.all for efficiency). Ideally all mutations should use `output(baseServerResponse)`, so as to ensure consistent return types.

# Query endpoints [.query() only]

Only return needed data; i.e. if only userID is required, only return that. Also ensure that potentially sensitive information is marked as "hidden" for anyone but people with proper permissions; e.g. hide IPs for anyone by admins, do not return quest information revealing the solutions unnessesarily, etc. Queries should usually not specify a `output()` type, but let it be inferred from what is returned.
