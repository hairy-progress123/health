import { NextResponse } from 'next/server';

// Generate TURN server credentials
// Uses Metered.ca free TURN API if API key is set,
// otherwise returns a list of known-working free TURN/STUN servers
export async function GET() {
    const meteredApiKey = process.env.METERED_API_KEY;

    // If Metered API key is available, fetch fresh ephemeral credentials
    if (meteredApiKey) {
        try {
            const res = await fetch(
                `https://healthsync.metered.live/api/v1/turn/credentials?apiKey=${meteredApiKey}`,
                { cache: 'no-store' }
            );
            if (res.ok) {
                const iceServers = await res.json();
                return NextResponse.json({ iceServers });
            }
        } catch {
            // Fall through to default servers
        }
    }

    // Default: return reliable STUN + TURN configuration
    // These use active Metered global TURN relays
    const iceServers = [
        { urls: 'stun:stun.relay.metered.ca:80' },
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        // Active Metered TURN servers
        {
            urls: 'turn:global.relay.metered.ca:80',
            username: '7322fe19c820841a7a89386a',
            credential: 'nyS+IbWR3E2QiRTI',
        },
        {
            urls: 'turn:global.relay.metered.ca:80?transport=tcp',
            username: '7322fe19c820841a7a89386a',
            credential: 'nyS+IbWR3E2QiRTI',
        },
        {
            urls: 'turn:global.relay.metered.ca:443',
            username: '7322fe19c820841a7a89386a',
            credential: 'nyS+IbWR3E2QiRTI',
        },
        {
            urls: 'turns:global.relay.metered.ca:443?transport=tcp',
            username: '7322fe19c820841a7a89386a',
            credential: 'nyS+IbWR3E2QiRTI',
        },
    ];

    return NextResponse.json({ iceServers });
}
