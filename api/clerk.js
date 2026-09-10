import { createClerkClient } from "@clerk/backend";

const clerk = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY
});

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    const { isSignedIn, userId } = await clerk.authenticateRequest(req);

    if (!isSignedIn || !userId) {
      return res.status(401).json({
        authenticated: false
      });
    }

    const user = await clerk.users.getUser(userId);

    const email =
      user.emailAddresses?.find(
        item => item.id === user.primaryEmailAddressId
      )?.emailAddress || "";

    return res.status(200).json({
      authenticated: true,
      user: {
        id: user.id,
        email
      }
    });

  } catch (error) {
    console.error("Clerk authentication error:", error);

    return res.status(500).json({
      error: "Authentication service error"
    });
  }
}
