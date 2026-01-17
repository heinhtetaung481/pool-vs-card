import { auth } from "./app/auth"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

export async function middleware(request: NextRequest) {
    const session = await auth()

    // Protect all routes starting with /game
    if (request.nextUrl.pathname.startsWith("/game")) {
        if (!session) {
            return NextResponse.redirect(new URL("/", request.url))
        }
    }

    return NextResponse.next()
}

export const config = {
    matcher: ["/game/:path*"],
}
