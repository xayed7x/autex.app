import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { processMessage } from '@/lib/conversation/orchestrator';
import { getCachedSettings } from '@/lib/workspace/settings-cache';


/**
 * Test Bot API Endpoint
 * 
 * This endpoint allows users to test their bot directly in the dashboard
 * using the same orchestrator logic as real Facebook Messenger conversations.
 * 
 * Test conversations are marked with is_test: true to isolate them from real data.
 */

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Authenticate user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    // Get request body
    const body = await request.json();
    const { messageText, imageUrl, conversationId: existingConvId, postback } = body;
    
    // Get user's workspace
    const { data: workspace, error: workspaceError } = await supabase
      .from('workspaces')
      .select('id, owner_id')
      .eq('owner_id', user.id)
      .single();
    
    if (workspaceError || !workspace) {
      return NextResponse.json(
        { error: 'Workspace not found' },
        { status: 404 }
      );
    }
    
    // Get Facebook page for this workspace
    const { data: fbPage, error: fbPageError } = await supabase
      .from('facebook_pages')
      .select('id, page_name')
      .eq('workspace_id', workspace.id)
      .single();
    
    if (fbPageError || !fbPage) {
      return NextResponse.json(
        { error: 'No Facebook Page connected. Please connect a Facebook Page first.' },
        { status: 400 }
      );
    }
    
    // Load workspace settings
    const settings = await getCachedSettings(workspace.id);
    
    // Create unique test PSID for this user
    const testPsid = `test-user-${user.id}`;
    
    // Find or create test conversation
    let conversationId = existingConvId;
    
    if (!conversationId) {
      // Check if test conversation already exists for this user and page
      const { data: existingConv } = await supabase
        .from('conversations')
        .select('id')
        .eq('fb_page_id', fbPage.id)
        .eq('customer_psid', testPsid)
        .single();
        
      if (existingConv) {
        // Use existing conversation and reset state
        conversationId = existingConv.id;
        
        // Reset state to IDLE for fresh test
        await supabase
          .from('conversations')
          .update({
            current_state: 'IDLE',
            context: {
              state: 'IDLE',
              cart: [],
              checkout: {},
              metadata: {}
            },
            last_message_at: new Date().toISOString(),
          })
          .eq('id', conversationId);
          
      } else {
        // Create new test conversation
        const { data: newConv, error: convError } = await supabase
          .from('conversations')
          .insert({
            workspace_id: workspace.id,
            fb_page_id: fbPage.id,
            customer_psid: testPsid,
            customer_name: 'Test User',
            current_state: 'IDLE',
            context: {
              state: 'IDLE',
              cart: [],
              checkout: {},
              metadata: {}
            },
            is_test: true, // Mark as test conversation
          })
          .select('id')
          .single();
        
        if (convError || !newConv) {
          console.error('Error creating test conversation:', convError);
          return NextResponse.json(
            { error: 'Failed to create test conversation' },
            { status: 500 }
          );
        }
        
        conversationId = newConv.id;
      }
    }
    
    // Log user's message
    if (messageText || imageUrl) {
      await supabase.from('messages').insert({
        conversation_id: conversationId,
        sender: 'customer',
        message_text: messageText || '(image)',
        message_type: imageUrl ? 'image' : 'text',
        attachments: imageUrl ? [{ url: imageUrl, type: 'image' }] : null,
      });
    }
    
    // Process message using existing orchestrator
    // This reuses ALL bot logic: image recognition, product search, order flow, etc.
    const result = await processMessage({
      workspaceId: workspace.id,
      conversationId,
      customerPsid: testPsid,
      messageText,
      imageUrl,
      pageId: String(fbPage.id),
      fbPageId: fbPage.id,
      isTestMode: true, // Skip Facebook API calls
    });
    
    // If order was created, mark it as test
    if (result.orderCreated && result.orderNumber) {
      await supabase
        .from('orders')
        .update({ is_test: true })
        .eq('order_number', result.orderNumber);
    }
    
    // Return response to frontend
    return NextResponse.json({
      success: true,
      conversationId,
      botResponse: result.response,
      productCard: result.productCard,
      newState: result.newState,
      orderCreated: result.orderCreated,
      orderNumber: result.orderNumber,
    });
    
  } catch (error) {
    console.error('Test bot API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
