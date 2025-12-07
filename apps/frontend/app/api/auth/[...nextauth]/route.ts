import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";

const handler = NextAuth({
    providers: [
        GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID ?? "",
            clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
        }),
    ],
    callbacks: {
        async signIn({ user }) {
            try {
                const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8000';
                await fetch(`${backendUrl}/v1/auth/sync`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        email: user.email,
                        name: user.name,
                        profile_image: user.image,
                    }),
                });
                return true;
            } catch (error) {
                console.error("Error syncing user to backend:", error);
                return true; // Allow sign in even if sync fails
            }
        },
        async session({ session, token }) {
            // Pass the access token to the client if needed, or user id
            if (session.user) {
                // @ts-ignore
                session.user.id = token.sub;
            }
            return session;
        },
    },
    pages: {
        signIn: '/', // Redirect to landing page on sign in request
    }
});

export { handler as GET, handler as POST };
