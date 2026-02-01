/**
 * HelpPage Component
 *
 * Embeds Chatbase AI assistant for user support and documentation.
 * The chatbot provides contextual help for the EDGE platform.
 */

import { useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { HelpCircle, MessageSquare, Book, ExternalLink } from 'lucide-react';
import { Button } from './ui/button';
import { identifyUserWithChatbase } from '../services/chatbaseIdentity';

// Chatbase bot configuration
const CHATBASE_BOT_ID = 'ZLVPw60JOZQsutoX-Nuyg';

export function HelpPage() {
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const scriptLoadedRef = useRef(false);
  const identifiedRef = useRef(false);

  useEffect(() => {
    // Only load script once
    if (scriptLoadedRef.current) return;

    // Check if Chatbase script is already loaded
    if (document.getElementById(CHATBASE_BOT_ID)) {
      scriptLoadedRef.current = true;
      // If script was already loaded, try to identify user
      if (!identifiedRef.current) {
        identifyUserWithChatbase().then(() => {
          identifiedRef.current = true;
        });
      }
      return;
    }

    // Initialize Chatbase queue if not already initialized
    const win = window as any;
    if (!win.chatbase || win.chatbase('getState') !== 'initialized') {
      win.chatbase = (...args: any[]) => {
        if (!win.chatbase.q) {
          win.chatbase.q = [];
        }
        win.chatbase.q.push(args);
      };
      win.chatbase = new Proxy(win.chatbase, {
        get(target: any, prop: string) {
          if (prop === 'q') {
            return target.q;
          }
          return (...args: any[]) => target(prop, ...args);
        }
      });
    }

    // Load Chatbase embed script
    const script = document.createElement('script');
    script.src = 'https://www.chatbase.co/embed.min.js';
    script.id = CHATBASE_BOT_ID;
    script.setAttribute('domain', 'www.chatbase.co');

    script.onload = () => {
      console.log('[HelpPage] Chatbase script loaded');
      scriptLoadedRef.current = true;

      // Identify user after script loads
      if (!identifiedRef.current) {
        // Small delay to ensure Chatbase is fully initialized
        setTimeout(() => {
          identifyUserWithChatbase().then(() => {
            identifiedRef.current = true;
          });
        }, 500);
      }
    };

    script.onerror = () => {
      console.error('[HelpPage] Failed to load Chatbase script');
    };

    document.body.appendChild(script);

    return () => {
      // Cleanup is handled by Chatbase itself
    };
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-high-emphasis flex items-center gap-2">
            <HelpCircle className="h-6 w-6 text-primary" />
            Help & Support
          </h1>
          <p className="text-sm text-medium-emphasis mt-1">
            Get assistance with the EDGE platform using our AI assistant
          </p>
        </div>
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="surface-1dp hover:surface-2dp transition-all cursor-pointer">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-primary" />
              <CardTitle className="text-base">AI Assistant</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <CardDescription>
              Ask questions about network configuration, troubleshooting, or any EDGE feature.
              The chat widget appears in the bottom-right corner.
            </CardDescription>
          </CardContent>
        </Card>

        <Card className="surface-1dp hover:surface-2dp transition-all cursor-pointer">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Book className="h-5 w-5 text-primary" />
              <CardTitle className="text-base">Documentation</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <CardDescription>
              Browse comprehensive guides, API references, and best practices for wireless network management.
            </CardDescription>
            <Button variant="link" className="p-0 h-auto mt-2 text-primary">
              View Docs <ExternalLink className="h-3 w-3 ml-1" />
            </Button>
          </CardContent>
        </Card>

        <Card className="surface-1dp hover:surface-2dp transition-all cursor-pointer">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <HelpCircle className="h-5 w-5 text-primary" />
              <CardTitle className="text-base">FAQ</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <CardDescription>
              Find answers to common questions about access points, clients, policies, and system configuration.
            </CardDescription>
          </CardContent>
        </Card>
      </div>

      {/* Chat Container - Chatbase will inject the widget */}
      <Card className="surface-2dp">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" />
            Chat with AI Assistant
          </CardTitle>
          <CardDescription>
            The Chatbase AI assistant widget will appear in the bottom-right corner of the screen.
            Click on it to start a conversation about any EDGE feature or issue.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div
            ref={chatContainerRef}
            className="min-h-[200px] flex items-center justify-center text-medium-emphasis"
          >
            <div className="text-center space-y-2">
              <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground/50" />
              <p className="text-sm">
                Look for the chat widget in the bottom-right corner
              </p>
              <p className="text-xs text-muted-foreground">
                Powered by Chatbase AI
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default HelpPage;
