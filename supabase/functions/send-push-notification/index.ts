export {};

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
  
  type PushRequest = {
    user_id: string;
    title: string;
    body: string;
    data?: Record<string, unknown>;
  };
  
  type PushTokenRow = {
    expo_push_token: string;
  };
  
  function jsonResponse(
    body: Record<string, unknown>,
    status = 200,
  ) {
    return new Response(JSON.stringify(body), {
      status,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
    });
  }
  
  Deno.serve(async (req: Request) => {
    // ---------------------------------------------------------
    // OPTIONS / CORS
    // ---------------------------------------------------------
  
    if (req.method === 'OPTIONS') {
      return new Response('ok', {
        status: 200,
        headers: corsHeaders,
      });
    }
  
    if (req.method !== 'POST') {
      return jsonResponse(
        {
          error: 'Method not allowed',
        },
        405,
      );
    }
  
    try {
      // -------------------------------------------------------
      // ENVIRONMENT
      // -------------------------------------------------------
  
      const supabaseUrl = Deno.env.get('SUPABASE_URL');
      const serviceRoleKey = Deno.env.get(
        'SUPABASE_SERVICE_ROLE_KEY',
      );
  
      if (!supabaseUrl || !serviceRoleKey) {
        console.error(
          'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY',
        );
  
        return jsonResponse(
          {
            error: 'Server configuration is incomplete.',
          },
          500,
        );
      }
  
      // -------------------------------------------------------
      // AUTHENTICATION
      // -------------------------------------------------------
  
      const authHeader =
        req.headers.get('Authorization');
  
      if (!authHeader) {
        return jsonResponse(
          {
            error: 'Missing authorization header.',
          },
          401,
        );
      }
  
      const token = authHeader.replace(
        'Bearer ',
        '',
      );
  
      if (!token) {
        return jsonResponse(
          {
            error: 'Invalid authorization token.',
          },
          401,
        );
      }
  
      // Verify the requesting user using Supabase Auth.
      const userResponse = await fetch(
        `${supabaseUrl}/auth/v1/user`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            apikey: serviceRoleKey,
          },
        },
      );
  
      if (!userResponse.ok) {
        return jsonResponse(
          {
            error: 'Unauthorized.',
          },
          401,
        );
      }
  
      const requestingUser =
        await userResponse.json();
  
      if (!requestingUser?.id) {
        return jsonResponse(
          {
            error: 'Unauthorized.',
          },
          401,
        );
      }
  
      // -------------------------------------------------------
      // REQUEST DATA
      // -------------------------------------------------------
  
      const payload =
        (await req.json()) as PushRequest;
  
      const {
        user_id,
        title,
        body,
        data,
      } = payload;
  
      if (!user_id || !title || !body) {
        return jsonResponse(
          {
            error:
              'user_id, title, and body are required.',
          },
          400,
        );
      }
  
      // -------------------------------------------------------
      // SECURITY
      // -------------------------------------------------------
      // For now, a user may only request a notification
      // for themselves.
      //
      // Later, Sidekick's server-side systems can be given
      // a separate server-to-server authorization method
      // for sending notifications to other users.
  
      if (requestingUser.id !== user_id) {
        return jsonResponse(
          {
            error:
              'You can only send notifications to your own account.',
          },
          403,
        );
      }
  
      // -------------------------------------------------------
      // GET USER'S PUSH TOKENS
      // -------------------------------------------------------
  
      const tokensResponse = await fetch(
        `${supabaseUrl}/rest/v1/push_tokens?user_id=eq.${encodeURIComponent(
          user_id,
        )}&select=expo_push_token`,
        {
          headers: {
            Authorization: `Bearer ${serviceRoleKey}`,
            apikey: serviceRoleKey,
          },
        },
      );
  
      if (!tokensResponse.ok) {
        const errorText =
          await tokensResponse.text();
  
        console.error(
          'Failed to retrieve push tokens:',
          errorText,
        );
  
        return jsonResponse(
          {
            error:
              'Could not retrieve push tokens.',
          },
          500,
        );
      }
  
      const tokens =
        (await tokensResponse.json()) as PushTokenRow[];
  
      if (!tokens.length) {
        return jsonResponse({
          success: true,
          message:
            'No push tokens found for this user.',
          sent: 0,
        });
      }
  
      // -------------------------------------------------------
      // BUILD EXPO PUSH MESSAGES
      // -------------------------------------------------------
  
      const messages = tokens.map((tokenRow) => ({
        to: tokenRow.expo_push_token,
        sound: 'default',
        title,
        body,
        data: data ?? {},
      }));
  
      // -------------------------------------------------------
      // SEND TO EXPO
      // -------------------------------------------------------
  
      const expoResponse = await fetch(
        'https://exp.host/--/api/v2/push/send',
        {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Accept-encoding': 'gzip, deflate',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(messages),
        },
      );
  
      const expoResult =
        await expoResponse.json();
  
      if (!expoResponse.ok) {
        console.error(
          'Expo push notification failed:',
          expoResult,
        );
  
        return jsonResponse(
          {
            error:
              'Expo push notification failed.',
            details: expoResult,
          },
          500,
        );
      }
  
      // -------------------------------------------------------
      // SUCCESS
      // -------------------------------------------------------
  
      console.log(
        `Push notification sent to ${tokens.length} device(s).`,
      );
  
      return jsonResponse({
        success: true,
        sent: tokens.length,
        tickets: expoResult?.data ?? expoResult,
      });
    } catch (error) {
      console.error(
        'Unexpected push notification error:',
        error,
      );
  
      return jsonResponse(
        {
          error:
            error instanceof Error
              ? error.message
              : 'Unexpected server error.',
        },
        500,
      );
    }
  });