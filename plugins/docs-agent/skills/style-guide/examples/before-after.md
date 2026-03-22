# Style Guide: Before and After Examples

## Example 1: Voice and Tense

**Before (passive, future tense):**
> The configuration file will be created by the system when the application is first launched. It should be noted that default values will be used.

**After (active, present tense):**
> The system creates a configuration file when you first launch the application. It uses default values unless you override them.

## Example 2: Conditions Before Instructions

**Before:**
> Click **Deploy** to deploy your application to production if you have completed testing.

**After:**
> After you complete testing, click **Deploy** to deploy your application to production.

## Example 3: Removing "Simply" and "Just"

**Before:**
> To fix this issue, simply delete the cache folder and just restart the server. It's easy!

**After:**
> To fix this issue, delete the cache folder and restart the server.

## Example 4: One Concept, One Word

**Before:**
> Create a new workspace for your team. Each project in the workspace contains tasks. Members of the space can view all projects.

**After (consistent use of "workspace"):**
> Create a new workspace for your team. Each project in the workspace contains tasks. Workspace members can view all projects.

## Example 5: User-Focused Changelog Entry

**Before (too technical):**
> Fix null pointer exception in UserService.java line 142 when avatarUrl field is null in database response

**After (user-focused):**
> Fix crash when viewing user profiles with missing avatars

## Example 6: Error Message

**Before:**
> Error: Operation failed. Please try again later.

**After:**
> Could not save the project. Check your network connection and try again. If the problem persists, contact support at support@example.com.

## Example 7: API Reference Description

**Before (too tutorial-like):**
> This function is really useful when you want to get the current user. You'll use it a lot! Just call it and it will give you back the user object with all their details.

**After (neutral, precise):**
> Returns the authenticated user's profile. Includes all public fields and, for the requesting user's own profile, private fields such as `email` and `preferences`.

## Example 8: Inclusive Language

**Before:**
> The master branch contains production code. When a developer pushes his changes, the CI pipeline runs. A sanity check verifies the deployment.

**After:**
> The main branch contains production code. When a developer pushes their changes, the CI pipeline runs. A smoke test verifies the deployment.
