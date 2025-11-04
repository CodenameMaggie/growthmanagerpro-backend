// ADD THIS CODE to your /api/pre-qualification-calls/[id].js 
// After the AI analyzes the call and assigns the score

// ... existing code to analyze call ...

// After AI score is calculated and saved:
if (ai_score >= 35) {
  console.log(`[Pre-Qual] Contact scored ${ai_score} - Triggering Smartlead handoff`);
  
  // Get the contact associated with this pre-qual call
  const { data: call } = await supabase
    .from('pre_qualification_calls')
    .select('*, contacts(*)')
    .eq('id', id)
    .single();

  if (call && call.contacts) {
    // Trigger Smartlead handoff
    try {
      const handoffResponse = await fetch(`${process.env.API_BASE}/api/smartlead-handoff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contactId: call.contacts.id,
          trigger: 'pre_qual_qualified',
          preQualScore: ai_score
        })
      });

      const handoffResult = await handoffResponse.json();
      
      if (handoffResult.success) {
        console.log(`[Pre-Qual] ✅ Successfully handed off to Smartlead`);
      } else {
        console.error(`[Pre-Qual] ❌ Handoff failed:`, handoffResult.error);
      }
    } catch (error) {
      console.error('[Pre-Qual] Error triggering Smartlead handoff:', error);
      // Don't fail the whole operation if handoff fails
    }
  }
}

// ... rest of your existing code ...
