import bcrypt from "bcrypt";
import type { SecureUser, User } from "../../../types/types";
import db from "../connection";
import { LOGIN, SIGNUP, UPDATE_DISPLAY_NAME } from "./sql";

const signup = async (username: string, email: string, clearTextPassword: string) => {
  // Basic validation
  if (!username || !email || !clearTextPassword) {
    throw "All fields are required";
  }

  const trimmedUsername = username.trim();
  const trimmedEmail = email.trim().toLowerCase(); // Emails are case-insensitive

  if (trimmedUsername === "" || trimmedEmail === "" || clearTextPassword === "") {
    throw "All fields are required";
  }

  // Check for existing username or email BEFORE attempting insert
  const existingUser = await db.oneOrNone<{
    username: string;
    email: string;
  }>(
    `SELECT username, email FROM users WHERE username = $1 OR email = $2`,
    [trimmedUsername, trimmedEmail]
  );

  if (existingUser) {
    if (existingUser.username === trimmedUsername) {
      throw "Username is already taken";
    }
    throw "Email is already in use";
  }

  // Hash password and create user
  const password = await bcrypt.hash(clearTextPassword, 10);

  try {
    return await db.one<User>(SIGNUP, [
      trimmedUsername,
      trimmedEmail,
      password,
      null, // display_name
    ]);
  } catch (error: any) {
    console.error("Unexpected error during user insertion:", error);
    throw "Unable to create account. Please try again later.";
  }
};

const login = async (username: string, clearTextPassword: string) => {
  if (!username || !clearTextPassword) {
    throw "Username and password are required";
  }

  const trimmedUsername = username.trim();

  try {
    const secureUser = await db.one<SecureUser>(LOGIN, [trimmedUsername]);

    const passwordMatches = await bcrypt.compare(clearTextPassword, secureUser.password);
    if (!passwordMatches) {
      throw "Invalid login information";
    }

    const { id, username, email, display_name, created_at } = secureUser;
    return { id, username, email, display_name, created_at } as User;
  } catch (e: any) {
    throw "Invalid login information";
  }
};

const updateDisplayName = async (userId: number, displayName: string) => {
  if (!displayName || displayName.trim() === "") {
    throw "Display name cannot be empty";
  }

  try {
    await db.none(UPDATE_DISPLAY_NAME, [displayName.trim(), userId]);
  } catch (e: any) {
    console.error("Failed to update display name:", e);
    throw "Failed to update display name";
  }
};

export { login, signup, updateDisplayName };