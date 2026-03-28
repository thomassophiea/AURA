import { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { ScrollArea } from './ui/scroll-area';
import { Skeleton } from './ui/skeleton';
import { Badge } from './ui/badge';
import {
  MessageCircle,
  Send,
  Mic,
  MicOff,
  RefreshCw,
  Bot,
  User,
  Sparkles,
  HelpCircle,
  Minimize2,
  Maximize2,
  Expand,
  Shrink,
  X,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Database
} from 'lucide-react';
import { chatbotService, ChatMessage, ChatAction, AssistantUIContext, CopyableValue, EvidenceTrail } from '../services/chatbot';
import { toast } from 'sonner';

// Storage key for chat history persistence
const CHAT_HISTORY_KEY = 'network-assistant-history';

// Context types for the Network Assistant
export interface AssistantContext {
  type: 'site' | 'client' | 'access-point' | 'wlan' | null;
  entityId?: string;
  entityName?: string;
  siteId?: string;
  siteName?: string;
  timeRange?: string;
}

interface NetworkChatbotProps {
  isOpen?: boolean;
  onToggle?: () => void;
  className?: string;
  // Context-aware props
  context?: AssistantContext;
  onShowClientDetail?: (macAddress: string, hostName?: string) => void;
  onShowAccessPointDetail?: (serialNumber: string, displayName?: string) => void;
  onShowSiteDetail?: (siteId: string, siteName: string) => void;
}

export function NetworkChatbot({
  isOpen = false,
  onToggle,
  className = '',
  context,
  onShowClientDetail,
  onShowAccessPointDetail,
  onShowSiteDetail
}: NetworkChatbotProps) {
  // Debug logging
  console.log('NetworkChatbot render:', { isOpen, onToggle: !!onToggle });

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [isListening, setIsListening] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [copiedValue, setCopiedValue] = useState<string | null>(null);
  const [expandedEvidence, setExpandedEvidence] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load chat history from localStorage
  useEffect(() => {
    try {
      const savedHistory = localStorage.getItem(CHAT_HISTORY_KEY);
      if (savedHistory) {
        const parsed = JSON.parse(savedHistory);
        // Restore timestamps as Date objects
        const restored = parsed.map((msg: any) => ({
          ...msg,
          timestamp: new Date(msg.timestamp)
        }));
        setMessages(restored);
      }
    } catch (e) {
      console.warn('Failed to load chat history:', e);
    }
  }, []);

  // Save chat history to localStorage
  useEffect(() => {
    if (messages.length > 0) {
      try {
        // Keep only last 50 messages to avoid localStorage limits
        const toSave = messages.slice(-50);
        localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(toSave));
      } catch (e) {
        console.warn('Failed to save chat history:', e);
      }
    }
  }, [messages]);

  // Keyboard shortcut: Cmd/Ctrl + K to toggle assistant
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        onToggle?.();
      }
      // Escape to close when open
      if (e.key === 'Escape' && isOpen) {
        onToggle?.();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onToggle, isOpen]);

  useEffect(() => {
    initializeChatbot();
    
    // Check if we're on a mobile device
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (isOpen && !isMinimized && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen, isMinimized]);

  const initializeChatbot = async () => {
    try {
      setIsInitializing(true);
      await chatbotService.initialize();
      
      // Start with empty messages - no welcome message
      setMessages([]);
    } catch (error) {
      console.error('Failed to initialize chatbot:', error);
      toast.error('Failed to initialize network assistant');
    } finally {
      setIsInitializing(false);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      type: 'user',
      content: inputValue.trim(),
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    try {
      // Convert UI context to service context format
      const serviceContext: AssistantUIContext | undefined = context ? {
        type: context.type,
        entityId: context.entityId,
        entityName: context.entityName,
        siteId: context.siteId,
        siteName: context.siteName,
        timeRange: context.timeRange
      } : undefined;

      const botResponse = await chatbotService.processQuery(userMessage.content, serviceContext);
      setMessages(prev => [...prev, botResponse]);
    } catch (error) {
      console.error('Failed to process query:', error);
      const errorMessage: ChatMessage = {
        id: `bot-error-${Date.now()}`,
        type: 'bot',
        content: "I'm sorry, I encountered an error processing your request. Please try again or contact support if the issue persists.",
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleVoiceInput = () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      toast.error('Speech recognition is not supported in this browser');
      return;
    }

    if (isListening) {
      setIsListening(false);
      return;
    }

    const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    const recognition = new SpeechRecognition();
    
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      setIsListening(true);
      toast.info('Listening... Speak your question');
    };

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setInputValue(transcript);
      setIsListening(false);
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      setIsListening(false);
      toast.error('Speech recognition failed. Please try again.');
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.start();
  };

  const handleRefreshContext = async () => {
    try {
      await chatbotService.refreshContext();
      toast.success('Network data refreshed');
      
      const refreshMessage: ChatMessage = {
        id: `bot-refresh-${Date.now()}`,
        type: 'bot',
        content: "✅ **Data refreshed!** I now have the latest information about your network. Feel free to ask me anything!",
        timestamp: new Date()
      };
      
      setMessages(prev => [...prev, refreshMessage]);
    } catch (error) {
      toast.error('Failed to refresh network data');
    }
  };

  const getSuggestedQuestions = () => {
    // Context-aware suggested questions
    if (context?.type === 'client') {
      return [
        "Is this client healthy?",
        "Why is this client slow?",
        "Show roaming history",
        "Is it a Wi-Fi issue or upstream?",
        "What AP is this client on?",
        "Show connection details"
      ];
    }
    if (context?.type === 'access-point') {
      return [
        "How is this AP performing?",
        "Are clients having issues?",
        "Is any radio overloaded?",
        "Show connected clients",
        "Is this an RF or uplink issue?",
        "Show AP health status"
      ];
    }
    if (context?.type === 'site' || context?.siteId) {
      return [
        "Show worst clients at this site",
        "Are any APs unhealthy?",
        "What changed recently?",
        "Show offline devices",
        "Find client by name or MAC",
        "Show site health status"
      ];
    }
    // Default questions (no context)
    return [
      "How many access points are online?",
      "Show me connected clients",
      "Find client by name or MAC",
      "Roaming history of a client",
      "Are there any offline devices?",
      "Show me site health status"
    ];
  };

  const handleActionClick = (action: ChatAction) => {
    switch (action.type) {
      case 'client':
        onShowClientDetail?.(action.entityId, action.entityName);
        break;
      case 'access-point':
        onShowAccessPointDetail?.(action.entityId, action.entityName);
        break;
      case 'site':
        onShowSiteDetail?.(action.entityId, action.entityName || action.entityId);
        break;
      case 'quick-action':
        // Handle quick actions like disassociate, refresh, reboot
        if (action.action === 'refresh') {
          handleRefreshContext();
        } else {
          toast.info(`Quick action: ${action.action} for ${action.entityName || action.entityId}`);
        }
        break;
    }
  };

  const handleCopyValue = useCallback(async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedValue(value);
      toast.success(`Copied ${label}`);
      setTimeout(() => setCopiedValue(null), 2000);
    } catch (e) {
      toast.error('Failed to copy to clipboard');
    }
  }, []);

  const handleSuggestionClick = (suggestion: string) => {
    setInputValue(suggestion);
    // Auto-send the suggestion
    setTimeout(() => {
      const syntheticEvent = { key: 'Enter', shiftKey: false, preventDefault: () => {} };
      handleKeyPress(syntheticEvent as React.KeyboardEvent);
    }, 100);
  };

  const clearChatHistory = () => {
    setMessages([]);
    localStorage.removeItem(CHAT_HISTORY_KEY);
    toast.success('Chat history cleared');
  };

  // Render copyable values (MAC, IP, Serial)
  const renderCopyableValues = (copyableValues: CopyableValue[] | undefined, compact = false) => {
    if (!copyableValues || copyableValues.length === 0) return null;

    return (
      <div className={`flex flex-wrap gap-1 ${compact ? 'mt-1' : 'mt-2'}`}>
        {copyableValues.slice(0, compact ? 3 : 6).map((item, idx) => (
          <Button
            key={idx}
            variant="ghost"
            size="sm"
            className={`${compact ? 'h-5 text-[10px] px-1.5' : 'h-6 text-xs px-2'} font-mono bg-muted/50 hover:bg-muted`}
            onClick={() => handleCopyValue(item.value, item.label)}
          >
            {copiedValue === item.value ? (
              <Check className={`${compact ? 'h-2.5 w-2.5' : 'h-3 w-3'} mr-1 text-[color:var(--status-success)]`} />
            ) : (
              <Copy className={`${compact ? 'h-2.5 w-2.5' : 'h-3 w-3'} mr-1`} />
            )}
            <span className="truncate max-w-[100px]">{item.value}</span>
          </Button>
        ))}
      </div>
    );
  };

  // Render evidence trail
  const renderEvidenceTrail = (evidence: EvidenceTrail | undefined, messageId: string, compact = false) => {
    if (!evidence) return null;

    const isExpanded = expandedEvidence === messageId;

    return (
      <div className={`${compact ? 'mt-1' : 'mt-2'} pt-1 border-t border-border/30`}>
        <button
          onClick={() => setExpandedEvidence(isExpanded ? null : messageId)}
          className={`flex items-center gap-1 text-muted-foreground hover:text-foreground ${compact ? 'text-[10px]' : 'text-xs'}`}
        >
          <Database className={compact ? 'h-2.5 w-2.5' : 'h-3 w-3'} />
          <span>Evidence trail</span>
          {isExpanded ? (
            <ChevronUp className={compact ? 'h-2.5 w-2.5' : 'h-3 w-3'} />
          ) : (
            <ChevronDown className={compact ? 'h-2.5 w-2.5' : 'h-3 w-3'} />
          )}
        </button>
        {isExpanded && (
          <div className={`${compact ? 'mt-1 text-[10px]' : 'mt-2 text-xs'} text-muted-foreground space-y-1`}>
            <div>
              <span className="font-medium">Endpoints:</span>
              <div className="ml-2">
                {evidence.endpointsCalled.map((ep, i) => (
                  <div key={i} className="font-mono">{ep}</div>
                ))}
              </div>
            </div>
            <div>
              <span className="font-medium">Data fields:</span>
              <span className="ml-1">{evidence.dataFields.join(', ')}</span>
            </div>
            <div>
              <span className="font-medium">Retrieved:</span>
              <span className="ml-1">{evidence.timestamp.toLocaleTimeString()}</span>
            </div>
          </div>
        )}
      </div>
    );
  };

  // Render follow-up suggestions
  const renderSuggestions = (suggestions: string[] | undefined, compact = false) => {
    if (!suggestions || suggestions.length === 0) return null;

    return (
      <div className={`${compact ? 'mt-1.5' : 'mt-2'} pt-1.5 border-t border-border/30`}>
        <div className={`${compact ? 'text-[10px]' : 'text-xs'} text-muted-foreground mb-1`}>Follow-up questions:</div>
        <div className="flex flex-wrap gap-1">
          {suggestions.slice(0, compact ? 2 : 3).map((suggestion, idx) => (
            <Button
              key={idx}
              variant="outline"
              size="sm"
              className={`${compact ? 'h-5 text-[10px] px-1.5' : 'h-6 text-xs px-2'}`}
              onClick={() => handleSuggestionClick(suggestion)}
            >
              {suggestion}
            </Button>
          ))}
        </div>
      </div>
    );
  };

  const getContextBanner = () => {
    if (!context?.type) return null;

    const contextInfo = {
      'client': { icon: '👤', label: 'Client', name: context.entityName || context.entityId },
      'access-point': { icon: '📡', label: 'AP', name: context.entityName || context.entityId },
      'site': { icon: '🏢', label: 'Site', name: context.siteName || context.entityName },
      'wlan': { icon: '📶', label: 'WLAN', name: context.entityName }
    }[context.type];

    if (!contextInfo) return null;

    return (
      <div className="flex items-center gap-2 px-3 py-1.5 bg-primary/10 rounded-full text-xs">
        <span>{contextInfo.icon}</span>
        <span className="text-muted-foreground">{contextInfo.label}:</span>
        <span className="font-medium truncate max-w-[150px]">{contextInfo.name}</span>
        {context.siteName && context.type !== 'site' && (
          <>
            <span className="text-muted-foreground">at</span>
            <span className="truncate max-w-[100px]">{context.siteName}</span>
          </>
        )}
      </div>
    );
  };

  const getContextPrompt = () => {
    if (!context?.type) return "What would you like to know about your network?";

    const prompts = {
      'client': `What would you like to know about ${context.entityName || 'this client'}?`,
      'access-point': `What would you like to know about ${context.entityName || 'this AP'}?`,
      'site': `What would you like to troubleshoot at ${context.siteName || 'this site'}?`,
      'wlan': `What would you like to know about ${context.entityName || 'this network'}?`
    };
    return prompts[context.type] || "What would you like to know?";
  };

  const formatMessageContent = (content: string) => {
    // Convert markdown-style formatting to HTML-like JSX
    const parts = content.split(/(\*\*.*?\*\*|\*.*?\*|`.*?`|•.*?(?=\n|$))/g);

    // MAC address pattern
    const macPattern = /([0-9a-fA-F]{2}[:-]){5}[0-9a-fA-F]{2}/g;

    const formatPart = (text: string, keyPrefix: string) => {
      // Check for MAC addresses in the text and make them clickable
      const macMatches = text.match(macPattern);
      if (macMatches) {
        const segments = text.split(macPattern);
        const result: React.ReactNode[] = [];
        let macIndex = 0;

        segments.forEach((segment, segIdx) => {
          if (segment) {
            result.push(<span key={`${keyPrefix}-seg-${segIdx}`}>{segment}</span>);
          }
          if (macIndex < macMatches.length) {
            const mac = macMatches[macIndex];
            result.push(
              <button
                key={`${keyPrefix}-mac-${macIndex}`}
                className="font-mono text-primary hover:underline cursor-pointer"
                onClick={() => onShowClientDetail?.(mac)}
              >
                {mac}
              </button>
            );
            macIndex++;
          }
        });
        return result;
      }
      return text;
    };

    return parts.map((part, index) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        const innerText = part.slice(2, -2);
        return <strong key={index} className="text-foreground">{formatPart(innerText, `strong-${index}`)}</strong>;
      }
      if (part.startsWith('*') && part.endsWith('*') && !part.startsWith('**')) {
        return <em key={index}>{part.slice(1, -1)}</em>;
      }
      if (part.startsWith('`') && part.endsWith('`')) {
        const codeContent = part.slice(1, -1);
        // Check if it's a MAC address
        if (macPattern.test(codeContent)) {
          return (
            <button
              key={index}
              className="bg-muted px-1 py-0.5 rounded text-xs font-mono text-primary hover:underline cursor-pointer"
              onClick={() => onShowClientDetail?.(codeContent)}
            >
              {codeContent}
            </button>
          );
        }
        return <code key={index} className="bg-muted px-1 py-0.5 rounded text-xs font-mono">{codeContent}</code>;
      }
      if (part.startsWith('• ')) {
        return <div key={index} className="ml-2">{formatPart(part, `bullet-${index}`)}</div>;
      }

      // Handle emojis and line breaks
      return part.split('\n').map((line, lineIndex) => (
        <span key={`${index}-${lineIndex}`}>
          {formatPart(line, `line-${index}-${lineIndex}`)}
          {lineIndex < part.split('\n').length - 1 && <br />}
        </span>
      ));
    });
  };

  // Always render the button with high visibility and responsive sizing
  const chatbotButton = (
    <div
      style={{
        position: 'fixed',
        bottom: 'clamp(16px, 4vw, 24px)',
        right: 'clamp(16px, 4vw, 24px)',
        zIndex: 99999,
        width: 'clamp(56px, 12vw, 64px)',
        height: 'clamp(56px, 12vw, 64px)'
      }}
    >
      <Button
        onClick={onToggle}
        size="icon"
        style={{
          width: '100%',
          height: '100%',
          borderRadius: '50%',
          backgroundColor: '#BB86FC',
          color: '#000000',
          boxShadow: '0 8px 32px rgba(187, 134, 252, 0.4), 0 4px 16px rgba(0, 0, 0, 0.2)',
          border: '2px solid rgba(255, 255, 255, 0.1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          transition: 'all 0.2s ease'
        }}
        onMouseEnter={(e) => {
          (e.target as HTMLElement).style.transform = 'scale(1.1)';
          (e.target as HTMLElement).style.boxShadow = '0 12px 48px rgba(187, 134, 252, 0.6), 0 6px 24px rgba(0, 0, 0, 0.3)';
        }}
        onMouseLeave={(e) => {
          (e.target as HTMLElement).style.transform = 'scale(1)';
          (e.target as HTMLElement).style.boxShadow = '0 8px 32px rgba(187, 134, 252, 0.4), 0 4px 16px rgba(0, 0, 0, 0.2)';
        }}
      >
        <MessageCircle 
          size={typeof window !== 'undefined' ? Math.min(28, Math.max(20, window.innerWidth * 0.04)) : 24} 
        />
      </Button>
    </div>
  );

  if (!isOpen) {
    return chatbotButton;
  }

  // Fullscreen mode renders as a full page overlay
  if (isFullScreen) {
    return (
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 99999,
          backgroundColor: 'var(--background)',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        <CardHeader className="flex flex-row items-center justify-between space-y-0 py-4 px-6 border-b border-border">
          <div className="flex items-center space-x-3">
            <div className="relative">
              <Bot className="h-6 w-6 text-primary" />
              <Sparkles className="h-3 w-3 text-secondary absolute -top-1 -right-1" />
            </div>
            <CardTitle className="text-lg font-semibold">Network Assistant</CardTitle>
            {getContextBanner()}
            {isInitializing && (
              <Badge variant="secondary" className="text-xs">
                <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                Initializing
              </Badge>
            )}
          </div>

          <div className="flex items-center space-x-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleRefreshContext}
              className="h-8 w-8"
              title="Refresh network data"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsFullScreen(false)}
              className="h-8 w-8"
              title="Exit full screen"
            >
              <Shrink className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                setIsFullScreen(false);
                onToggle?.();
              }}
              className="h-8 w-8"
              title="Close"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>

        <div className="flex-1 flex overflow-hidden" style={{ minHeight: 0 }}>
          {/* Main chat area */}
          <div className="flex-1 flex flex-col max-w-4xl mx-auto w-full px-4" style={{ minHeight: 0 }}>
            <ScrollArea className="flex-1" style={{ minHeight: 0 }}>
              <div className="p-6">
              <div className="space-y-4">
                {messages.length === 0 && !isLoading && (
                  <div className="text-center py-12">
                    <Bot className="h-16 w-16 mx-auto mb-4 text-primary opacity-50" />
                    <h3 className="text-xl font-semibold mb-2">Network Assistant</h3>
                    <p className="text-muted-foreground mb-6">
                      {getContextPrompt()}
                    </p>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 max-w-2xl mx-auto">
                      {getSuggestedQuestions().map((question, index) => (
                        <Button
                          key={index}
                          variant="outline"
                          className="h-auto py-3 px-4 text-sm text-left whitespace-normal"
                          onClick={() => setInputValue(question)}
                        >
                          {question}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}

                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[70%] rounded-lg px-4 py-3 ${
                        message.type === 'user'
                          ? 'bg-primary text-primary-foreground'
                          : 'surface-1dp border border-border'
                      }`}
                    >
                      <div className="flex items-start space-x-3">
                        {message.type === 'bot' && (
                          <Bot className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                        )}
                        {message.type === 'user' && (
                          <User className="h-5 w-5 text-primary-foreground mt-0.5 flex-shrink-0" />
                        )}
                        <div className="flex-1 space-y-1">
                          <div className="whitespace-pre-wrap">
                            {formatMessageContent(message.content)}
                          </div>
                          <div className={`text-xs opacity-70 ${
                            message.type === 'user' ? 'text-primary-foreground' : 'text-muted-foreground'
                          }`}>
                            {message.timestamp.toLocaleTimeString()}
                          </div>
                          {/* Action buttons for deep links */}
                          {message.actions && message.actions.length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-2 pt-2 border-t border-border/50">
                              {message.actions.map((action, idx) => (
                                <Button
                                  key={idx}
                                  variant="outline"
                                  size="sm"
                                  className="h-7 text-xs"
                                  onClick={() => handleActionClick(action)}
                                >
                                  {action.type === 'client' ? '👤' : action.type === 'access-point' ? '📡' : action.type === 'quick-action' ? '⚡' : '🏢'}
                                  <span className="ml-1">{action.label}</span>
                                </Button>
                              ))}
                            </div>
                          )}
                          {/* Copyable values (MAC, IP) */}
                          {renderCopyableValues(message.copyableValues, false)}
                          {/* Follow-up suggestions */}
                          {renderSuggestions(message.suggestions, false)}
                          {/* Evidence trail */}
                          {renderEvidenceTrail(message.evidence, message.id, false)}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}

                {isLoading && (
                  <div className="flex justify-start">
                    <div className="max-w-[70%] surface-1dp border border-border rounded-lg px-4 py-3">
                      <div className="flex items-center space-x-3">
                        <Bot className="h-5 w-5 text-primary" />
                        <div className="flex space-x-1">
                          <div className="h-2 w-2 bg-primary rounded-full animate-bounce"></div>
                          <div className="h-2 w-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                          <div className="h-2 w-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div ref={messagesEndRef} />
              </div>
            </ScrollArea>

            <div className="border-t border-border p-4">
              <div className="flex items-center space-x-3 max-w-3xl mx-auto">
                <div className="flex-1 relative">
                  <Input
                    ref={inputRef}
                    placeholder="Ask about your network..."
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyPress={handleKeyPress}
                    disabled={isLoading || isInitializing}
                    className="pr-10 h-12 text-base"
                  />
                  {isListening && (
                    <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                      <div className="h-3 w-3 bg-[color:var(--status-error)] rounded-full animate-pulse"></div>
                    </div>
                  )}
                </div>

                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleVoiceInput}
                  disabled={isLoading || isInitializing}
                  className={`h-12 w-12 ${isListening ? 'text-[color:var(--status-error)]' : ''}`}
                  title="Voice input"
                >
                  {isListening ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                </Button>

                <Button
                  onClick={handleSendMessage}
                  disabled={!inputValue.trim() || isLoading || isInitializing}
                  size="icon"
                  className="h-12 w-12"
                >
                  <Send className="h-5 w-5" />
                </Button>
              </div>

              <div className="flex items-center justify-between mt-3 max-w-3xl mx-auto">
                <div className="text-sm text-muted-foreground">
                  Press Enter to send • <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs">⌘K</kbd> to toggle
                </div>

                <div className="flex items-center gap-2">
                  {messages.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={clearChatHistory}
                      className="text-sm text-muted-foreground hover:text-destructive"
                    >
                      Clear history
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setInputValue('help');
                      setTimeout(() => handleSendMessage(), 100);
                    }}
                    className="text-sm"
                  >
                    <HelpCircle className="h-4 w-4 mr-1" />
                    Help
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {chatbotButton}
      <div
        style={{
          position: 'fixed',
          bottom: isMobile ? 'clamp(80px, 15vh, 100px)' : 'clamp(88px, 20vh, 120px)',
          right: isMobile ? '8px' : 'clamp(16px, 4vw, 24px)',
          left: isMobile ? '8px' : 'auto',
          width: isMobile ? 'calc(100vw - 16px)' : 'min(384px, calc(100vw - 32px))',
          height: isMinimized ? '64px' : (isMobile ? 'min(70vh, calc(100vh - 140px))' : 'min(600px, calc(100vh - 160px))'),
          maxWidth: isMobile ? 'none' : '384px',
          maxHeight: isMinimized ? '64px' : 'calc(100vh - 140px)',
          minHeight: isMinimized ? '64px' : (isMobile ? '280px' : '320px'),
          zIndex: 99998,
          backgroundColor: 'var(--background)',
          border: '1px solid var(--border)',
          borderRadius: isMobile ? '12px 12px 0 0' : '12px',
          boxShadow: '0 20px 64px rgba(0, 0, 0, 0.3), 0 8px 32px rgba(0, 0, 0, 0.15)',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        <CardHeader className={`flex flex-col space-y-2 pb-2 border-b border-border ${isMobile ? 'px-3 py-2' : 'px-4 py-3'}`}>
          <div className="flex flex-row items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="relative">
                <Bot className="h-5 w-5 text-primary" />
                <Sparkles className="h-2 w-2 text-secondary absolute -top-1 -right-1" />
              </div>
              <CardTitle className={`font-medium ${isMobile ? 'text-xs' : 'text-sm'}`}>Network Assistant</CardTitle>
              {isInitializing && (
                <Badge variant="secondary" className="text-xs">
                  <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                  Initializing
                </Badge>
              )}
            </div>
          
          <div className="flex items-center space-x-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleRefreshContext}
              className="h-6 w-6"
              title="Refresh network data"
            >
              <RefreshCw className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                setIsFullScreen(!isFullScreen);
                setIsMinimized(false);
              }}
              className="h-6 w-6"
              title={isFullScreen ? "Exit full screen" : "Full screen"}
            >
              {isFullScreen ? <Shrink className="h-3 w-3" /> : <Expand className="h-3 w-3" />}
            </Button>
            {!isFullScreen && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsMinimized(!isMinimized)}
                className="h-6 w-6"
                title={isMinimized ? "Expand" : "Minimize"}
              >
                {isMinimized ? <Maximize2 className="h-3 w-3" /> : <Minimize2 className="h-3 w-3" />}
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                setIsFullScreen(false);
                onToggle?.();
              }}
              className="h-6 w-6"
              title="Close"
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
          </div>
          {context?.type && (
            <div className="flex items-center gap-1.5 text-xs">
              <span>
                {context.type === 'client' ? '👤' : context.type === 'access-point' ? '📡' : '🏢'}
              </span>
              <span className="text-muted-foreground truncate max-w-[200px]">
                {context.entityName || context.entityId}
              </span>
            </div>
          )}
        </CardHeader>

        {!isMinimized && (
          <>
            <CardContent className="flex-1 flex flex-col p-0 min-h-0">
              <ScrollArea className="flex-1 p-4" style={{ minHeight: 0 }}>
                <div className="space-y-4">
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                          message.type === 'user'
                            ? 'bg-primary text-primary-foreground'
                            : 'surface-1dp border border-border'
                        }`}
                      >
                        <div className="flex items-start space-x-2">
                          {message.type === 'bot' && (
                            <Bot className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                          )}
                          {message.type === 'user' && (
                            <User className="h-4 w-4 text-primary-foreground mt-0.5 flex-shrink-0" />
                          )}
                          <div className="flex-1 space-y-1">
                            <div className="whitespace-pre-wrap">
                              {formatMessageContent(message.content)}
                            </div>
                            <div className={`text-xs opacity-70 ${
                              message.type === 'user' ? 'text-primary-foreground' : 'text-muted-foreground'
                            }`}>
                              {message.timestamp.toLocaleTimeString()}
                            </div>
                            {/* Action buttons for deep links */}
                            {message.actions && message.actions.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-2 pt-2 border-t border-border/50">
                                {message.actions.slice(0, 3).map((action, idx) => (
                                  <Button
                                    key={idx}
                                    variant="outline"
                                    size="sm"
                                    className="h-6 text-xs px-2"
                                    onClick={() => handleActionClick(action)}
                                  >
                                    {action.type === 'client' ? '👤' : action.type === 'access-point' ? '📡' : action.type === 'quick-action' ? '⚡' : '🏢'}
                                    <span className="ml-1 truncate max-w-[100px]">{action.label}</span>
                                  </Button>
                                ))}
                                {message.actions.length > 3 && (
                                  <span className="text-xs text-muted-foreground self-center">
                                    +{message.actions.length - 3} more
                                  </span>
                                )}
                              </div>
                            )}
                            {/* Copyable values (MAC, IP) - compact mode */}
                            {renderCopyableValues(message.copyableValues, true)}
                            {/* Follow-up suggestions - compact mode */}
                            {renderSuggestions(message.suggestions, true)}
                            {/* Evidence trail - compact mode */}
                            {renderEvidenceTrail(message.evidence, message.id, true)}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}

                  {isLoading && (
                    <div className="flex justify-start">
                      <div className="max-w-[85%] surface-1dp border border-border rounded-lg px-3 py-2">
                        <div className="flex items-center space-x-2">
                          <Bot className="h-4 w-4 text-primary" />
                          <div className="flex space-x-1">
                            <div className="h-2 w-2 bg-primary rounded-full animate-bounce"></div>
                            <div className="h-2 w-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                            <div className="h-2 w-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {messages.length <= 1 && !isLoading && (
                    <div className="space-y-2">
                      <div className="text-xs text-muted-foreground font-medium">Suggested questions:</div>
                      <div className="flex flex-wrap gap-1">
                        {getSuggestedQuestions().slice(0, isMobile ? 2 : 3).map((question, index) => (
                          <Button
                            key={index}
                            variant="outline"
                            size="sm"
                            className={`text-xs h-6 px-2 ${isMobile ? 'flex-1 min-w-0' : ''}`}
                            onClick={() => setInputValue(question)}
                          >
                            <span className={isMobile ? 'truncate' : ''}>{question}</span>
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <div ref={messagesEndRef} />
              </ScrollArea>
            </CardContent>
            
            <div className={`border-t border-border ${isMobile ? 'p-2' : 'p-3'}`}>
              <div className="flex items-center space-x-2">
                <div className="flex-1 relative">
                  <Input
                    ref={inputRef}
                    placeholder={isMobile ? "Ask about network..." : "Ask about your network..."}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyPress={handleKeyPress}
                    disabled={isLoading || isInitializing}
                    className="pr-8"
                    style={{ fontSize: isMobile ? '16px' : undefined }} // Prevents zoom on iOS
                  />
                  {isListening && (
                    <div className="absolute right-2 top-1/2 transform -translate-y-1/2">
                      <div className="h-2 w-2 bg-[color:var(--status-error)] rounded-full animate-pulse"></div>
                    </div>
                  )}
                </div>
                
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleVoiceInput}
                  disabled={isLoading || isInitializing}
                  className={`${isMobile ? 'h-9 w-9' : 'h-8 w-8'} ${isListening ? 'text-[color:var(--status-error)]' : ''}`}
                  title="Voice input"
                >
                  {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                </Button>
                
                <Button
                  onClick={handleSendMessage}
                  disabled={!inputValue.trim() || isLoading || isInitializing}
                  size="icon"
                  className={isMobile ? 'h-9 w-9' : 'h-8 w-8'}
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
              
              <div className={`flex items-center justify-between ${isMobile ? 'mt-1' : 'mt-2'}`}>
                <div className={`text-xs text-muted-foreground ${isMobile ? 'hidden' : ''}`}>
                  <kbd className="px-1 py-0.5 bg-muted rounded text-[10px]">⌘K</kbd> to toggle
                </div>

                <div className={`flex items-center gap-1 ${isMobile ? 'ml-auto' : ''}`}>
                  {messages.length > 0 && !isMobile && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={clearChatHistory}
                      className="text-xs h-6 px-2 text-muted-foreground hover:text-destructive"
                    >
                      Clear
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      const helpMessage: ChatMessage = {
                        id: `user-help-${Date.now()}`,
                        type: 'user',
                        content: 'help',
                        timestamp: new Date()
                      };
                      setMessages(prev => [...prev, helpMessage]);
                      handleSendMessage();
                    }}
                    className="text-xs h-6 px-2"
                  >
                    <HelpCircle className="h-3 w-3 mr-1" />
                    Help
                  </Button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}