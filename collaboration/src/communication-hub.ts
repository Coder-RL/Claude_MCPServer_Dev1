import { EventEmitter } from 'events';
import WebSocket from 'ws';

export interface CommunicationHub {
  id: string;
  name: string;
  type: 'workspace' | 'project' | 'team' | 'public' | 'private';
  owner: string;
  members: HubMember[];
  channels: Channel[];
  settings: HubSettings;
  permissions: HubPermissions;
  integrations: Integration[];  
  status: 'active' | 'archived' | 'suspended';
  createdAt: Date;
  updatedAt: Date;
}

export interface HubMember {
  userId: string;
  role: 'owner' | 'admin' | 'member' | 'guest';
  permissions: string[];
  joinedAt: Date;
  lastActive: Date;
  status: 'online' | 'away' | 'busy' | 'offline';
  presence: UserPresence;
}

export interface UserPresence {
  status: 'online' | 'away' | 'busy' | 'offline';
  activity: string;
  location?: string;
  customMessage?: string;
  lastSeen: Date;
}

export interface Channel {
  id: string;
  name: string;
  description?: string;
  type: 'text' | 'voice' | 'video' | 'screen_share' | 'thread' | 'dm';
  hubId: string;
  members: string[];
  moderators: string[];
  settings: ChannelSettings;
  permissions: ChannelPermissions;
  createdBy: string;
  createdAt: Date;
  lastActivity: Date;
  messageCount: number;
  isPrivate: boolean;
}

export interface ChannelSettings {
  autoDeleteMessages: boolean;
  autoDeleteAfter: number;
  slowMode: boolean;
  slowModeDelay: number;
  maxMessageLength: number;
  allowFiles: boolean;
  allowImages: boolean;
  allowVideos: boolean;
  allowEmojis: boolean;
  allowMentions: boolean;
  allowThreads: boolean;
}

export interface ChannelPermissions {
  canSendMessages: string[];
  canEditMessages: string[];
  canDeleteMessages: string[];
  canPinMessages: string[];
  canManageChannel: string[];
  canInviteMembers: string[];
  canKickMembers: string[];
  canStartVoiceCall: string[];
  canStartVideoCall: string[];
  canShareScreen: string[];
}

export interface HubSettings {
  defaultChannelPermissions: ChannelPermissions;
  allowGuestInvites: boolean;
  requireApprovalForJoining: boolean;
  enableVoiceCalls: boolean;
  enableVideoCalls: boolean;
  enableScreenShare: boolean;
  enableFileSharing: boolean;
  maxFileSize: number;
  allowedFileTypes: string[];
  messageRetention: number;
  enableEncryption: boolean;
  enableReadReceipts: boolean;
  enableTypingIndicators: boolean;
  enablePresenceStatus: boolean;
}

export interface HubPermissions {
  canInviteMembers: string[];
  canRemoveMembers: string[];
  canCreateChannels: string[];
  canDeleteChannels: string[];
  canManageRoles: string[];
  canManageSettings: string[];
  canManageIntegrations: string[];
  canViewAuditLog: string[];
  canExportData: string[];
}

export interface Integration {
  id: string;
  type: 'webhook' | 'bot' | 'api' | 'notification' | 'calendar' | 'file_storage';
  name: string;
  description?: string;
  config: IntegrationConfig;
  permissions: string[];
  enabled: boolean;
  createdBy: string;
  createdAt: Date;
  lastUsed: Date;
}

export interface IntegrationConfig {
  webhookUrl?: string;
  apiKey?: string;
  authToken?: string;
  events: string[];
  filters: Record<string, any>;
  customSettings: Record<string, any>;
}

export interface Message {
  id: string;
  channelId: string;
  senderId: string;
  type: 'text' | 'file' | 'image' | 'video' | 'audio' | 'link' | 'system' | 'reaction';
  content: MessageContent;
  metadata: MessageMetadata;
  reactions: Reaction[];
  replies: Reply[];
  mentions: Mention[];
  attachments: Attachment[];
  timestamp: Date;
  editedAt?: Date;
  deletedAt?: Date;
  pinned: boolean;
  threadId?: string;
}

export interface MessageContent {
  text?: string;
  html?: string;
  markdown?: string;
  embeds?: Embed[];
  poll?: Poll;
  codeBlock?: CodeBlock;
}

export interface Embed {
  type: 'link' | 'image' | 'video' | 'rich';
  title?: string;
  description?: string;
  url?: string;
  thumbnail?: string;
  author?: EmbedAuthor;
  fields?: EmbedField[];
  footer?: EmbedFooter;
  color?: string;
}

export interface EmbedAuthor {
  name: string;
  url?: string;
  iconUrl?: string;
}

export interface EmbedField {
  name: string;
  value: string;
  inline: boolean;
}

export interface EmbedFooter {
  text: string;
  iconUrl?: string;
}

export interface Poll {
  question: string;
  options: PollOption[];
  allowMultiple: boolean;
  anonymous: boolean;
  expiresAt?: Date;
}

export interface PollOption {
  id: string;
  text: string;
  votes: string[];
}

export interface CodeBlock {
  language: string;
  code: string;
  syntax: boolean;
}

export interface MessageMetadata {
  readBy: ReadReceipt[];
  deliveredTo: string[];
  encrypted: boolean;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  tags: string[];
  language?: string;
  sentiment?: 'positive' | 'negative' | 'neutral';
}

export interface ReadReceipt {
  userId: string;
  readAt: Date;
}

export interface Reaction {
  emoji: string;
  users: string[];
  count: number;
  timestamp: Date;
}

export interface Reply {
  id: string;
  senderId: string;
  content: MessageContent;
  timestamp: Date;
  reactions: Reaction[];
}

export interface Mention {
  type: 'user' | 'channel' | 'role' | 'everyone' | 'here';
  targetId: string;
  startIndex: number;
  endIndex: number;
}

export interface Attachment {
  id: string;
  name: string;
  type: string;
  size: number;
  url: string;
  thumbnail?: string;
  metadata: FileMetadata;
}

export interface FileMetadata {
  width?: number;
  height?: number;
  duration?: number;
  checksum: string;
  mimeType: string;
  uploadedBy: string;
  uploadedAt: Date;
  scanned: boolean;
  safe: boolean;
}

export interface VoiceCall {
  id: string;
  channelId: string;
  participants: CallParticipant[];
  status: 'waiting' | 'active' | 'ended';
  type: 'voice' | 'video' | 'screen_share';
  settings: CallSettings;
  recording?: CallRecording;
  startedAt: Date;
  endedAt?: Date;
  duration?: number;
}

export interface CallParticipant {
  userId: string;
  joinedAt: Date;
  leftAt?: Date;
  status: 'connecting' | 'connected' | 'muted' | 'disconnected';
  permissions: CallPermissions;
  mediaState: MediaState;
}

export interface CallPermissions {
  canSpeak: boolean;
  canVideo: boolean;
  canShareScreen: boolean;
  canRecord: boolean;
  canInvite: boolean;
  canMute: boolean;
  canKick: boolean;
}

export interface MediaState {
  audioEnabled: boolean;
  videoEnabled: boolean;
  screenShareEnabled: boolean;
  audioMuted: boolean;
  videoMuted: boolean;
  quality: 'low' | 'medium' | 'high' | 'auto';
}

export interface CallSettings {
  maxParticipants: number;
  recordingEnabled: boolean;
  waitingRoom: boolean;
  muteOnJoin: boolean;
  requirePermissionToJoin: boolean;
  allowScreenShare: boolean;
  endCallForAll: boolean;
}

export interface CallRecording {
  id: string;
  url: string;
  startedAt: Date;
  endedAt: Date;
  duration: number;
  size: number;
  participants: string[];
  transcription?: string;
}

export interface NotificationPreferences {
  userId: string;
  hubId: string;
  channelId?: string;
  desktop: boolean;
  mobile: boolean;
  email: boolean;
  sound: boolean;
  mentions: boolean;
  directMessages: boolean;
  keywords: string[];
  schedule: NotificationSchedule;
  doNotDisturb: DoNotDisturbSettings;
}

export interface NotificationSchedule {
  enabled: boolean;
  timezone: string;
  allowedHours: {
    start: string;
    end: string;
  };
  allowedDays: string[];
}

export interface DoNotDisturbSettings {
  enabled: boolean;
  until?: Date;
  exceptions: string[];
}

export interface AuditEvent {
  id: string;
  hubId: string;
  type: string;
  action: string;
  actor: string;
  target?: string;
  details: Record<string, any>;
  timestamp: Date;
  ipAddress: string;
  userAgent: string;
}

export interface Webhook {
  id: string;
  hubId: string;
  channelId?: string;
  url: string;
  secret: string;
  events: string[];
  filters: WebhookFilter[];
  enabled: boolean;
  retries: number;
  timeout: number;
  lastTriggered?: Date;
  successCount: number;
  failureCount: number;
  createdBy: string;
  createdAt: Date;
}

export interface WebhookFilter {
  field: string;
  operator: 'eq' | 'ne' | 'contains' | 'regex';
  value: any;
}

export interface Bot {
  id: string;
  name: string;
  username: string;
  avatar?: string;
  description?: string;
  hubId: string;
  permissions: string[];
  commands: BotCommand[];
  webhooks: string[];
  status: 'online' | 'offline' | 'error';
  createdBy: string;
  createdAt: Date;
  lastActive: Date;
}

export interface BotCommand {
  name: string;
  description: string;
  usage: string;
  permissions: string[];
  handler: string;
  parameters: BotParameter[];
}

export interface BotParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'user' | 'channel';
  required: boolean;
  description: string;
  choices?: string[];
}

export class CommunicationHubManager extends EventEmitter {
  private hubs = new Map<string, CommunicationHub>();
  private channels = new Map<string, Channel>();
  private messages = new Map<string, Message[]>();
  private activeCalls = new Map<string, VoiceCall>();
  private webhooks = new Map<string, Webhook>();
  private bots = new Map<string, Bot>();
  private auditLog = new Map<string, AuditEvent[]>();
  private notifications = new Map<string, NotificationPreferences>();
  private wsConnections = new Map<string, WebSocket>();
  private userSessions = new Map<string, UserSession>();

  constructor() {
    super();
    this.startPresenceTracking();
    this.startMessageCleanup();
    this.startNotificationProcessor();
  }

  // Hub Management
  async createHub(hub: Omit<CommunicationHub, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    try {
      const hubId = this.generateId();
      const communicationHub: CommunicationHub = {
        id: hubId,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...hub
      };

      this.hubs.set(hubId, communicationHub);
      
      // Create default channels
      await this.createDefaultChannels(hubId);
      
      // Log audit event
      await this.logAuditEvent(hubId, 'hub', 'create', hub.owner, hubId, {
        name: hub.name,
        type: hub.type
      });

      this.emit('hubCreated', { hub: communicationHub });
      return hubId;
    } catch (error) {
      this.emit('error', { operation: 'createHub', error });
      throw error;
    }
  }

  async updateHub(hubId: string, updates: Partial<CommunicationHub>): Promise<boolean> {
    try {
      const hub = this.hubs.get(hubId);
      if (!hub) {
        throw new Error(`Hub ${hubId} not found`);
      }

      Object.assign(hub, updates, { updatedAt: new Date() });
      
      await this.logAuditEvent(hubId, 'hub', 'update', 'system', hubId, updates);
      this.emit('hubUpdated', { hub });
      
      return true;
    } catch (error) {
      this.emit('error', { operation: 'updateHub', error });
      return false;
    }
  }

  async deleteHub(hubId: string): Promise<boolean> {
    try {
      const hub = this.hubs.get(hubId);
      if (!hub) {
        return false;
      }

      // Delete all channels
      const hubChannels = Array.from(this.channels.values())
        .filter(c => c.hubId === hubId);
      
      for (const channel of hubChannels) {
        await this.deleteChannel(channel.id);
      }

      this.hubs.delete(hubId);
      this.auditLog.delete(hubId);
      
      await this.logAuditEvent(hubId, 'hub', 'delete', 'system', hubId, {});
      this.emit('hubDeleted', { hubId });
      
      return true;
    } catch (error) {
      this.emit('error', { operation: 'deleteHub', error });
      return false;
    }
  }

  async getHub(hubId: string): Promise<CommunicationHub | undefined> {
    return this.hubs.get(hubId);
  }

  async getHubs(userId?: string): Promise<CommunicationHub[]> {
    let hubs = Array.from(this.hubs.values());
    
    if (userId) {
      hubs = hubs.filter(h => 
        h.members.some(m => m.userId === userId) || h.owner === userId
      );
    }

    return hubs.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  async joinHub(hubId: string, userId: string, role: string = 'member'): Promise<boolean> {
    try {
      const hub = this.hubs.get(hubId);
      if (!hub) {
        throw new Error(`Hub ${hubId} not found`);
      }

      // Check if user is already a member
      const existingMember = hub.members.find(m => m.userId === userId);
      if (existingMember) {
        return true;
      }

      const member: HubMember = {
        userId,
        role: role as any,
        permissions: this.getDefaultPermissions(role),
        joinedAt: new Date(),
        lastActive: new Date(),
        status: 'online',
        presence: {
          status: 'online',
          activity: 'Just joined',
          lastSeen: new Date()
        }
      };

      hub.members.push(member);
      hub.updatedAt = new Date();

      await this.logAuditEvent(hubId, 'member', 'join', userId, userId, { role });
      this.emit('memberJoined', { hubId, member });
      
      return true;
    } catch (error) {
      this.emit('error', { operation: 'joinHub', error });
      return false;
    }
  }

  async leaveHub(hubId: string, userId: string): Promise<boolean> {
    try {
      const hub = this.hubs.get(hubId);
      if (!hub) {
        return false;
      }

      const memberIndex = hub.members.findIndex(m => m.userId === userId);
      if (memberIndex === -1) {
        return false;
      }

      hub.members.splice(memberIndex, 1);
      hub.updatedAt = new Date();

      await this.logAuditEvent(hubId, 'member', 'leave', userId, userId, {});
      this.emit('memberLeft', { hubId, userId });
      
      return true;
    } catch (error) {
      this.emit('error', { operation: 'leaveHub', error });
      return false;
    }
  }

  // Channel Management
  async createChannel(channel: Omit<Channel, 'id' | 'createdAt' | 'lastActivity' | 'messageCount'>): Promise<string> {
    try {
      const channelId = this.generateId();
      const newChannel: Channel = {
        id: channelId,
        createdAt: new Date(),
        lastActivity: new Date(),
        messageCount: 0,
        ...channel
      };

      this.channels.set(channelId, newChannel);
      this.messages.set(channelId, []);

      await this.logAuditEvent(channel.hubId, 'channel', 'create', channel.createdBy, channelId, {
        name: channel.name,
        type: channel.type
      });

      this.emit('channelCreated', { channel: newChannel });
      return channelId;
    } catch (error) {
      this.emit('error', { operation: 'createChannel', error });
      throw error;
    }
  }

  async updateChannel(channelId: string, updates: Partial<Channel>): Promise<boolean> {
    try {
      const channel = this.channels.get(channelId);
      if (!channel) {
        throw new Error(`Channel ${channelId} not found`);
      }

      Object.assign(channel, updates);
      
      await this.logAuditEvent(channel.hubId, 'channel', 'update', 'system', channelId, updates);
      this.emit('channelUpdated', { channel });
      
      return true;
    } catch (error) {
      this.emit('error', { operation: 'updateChannel', error });
      return false;
    }
  }

  async deleteChannel(channelId: string): Promise<boolean> {
    try {
      const channel = this.channels.get(channelId);
      if (!channel) {
        return false;
      }

      this.channels.delete(channelId);
      this.messages.delete(channelId);
      
      await this.logAuditEvent(channel.hubId, 'channel', 'delete', 'system', channelId, {});
      this.emit('channelDeleted', { channelId });
      
      return true;
    } catch (error) {
      this.emit('error', { operation: 'deleteChannel', error });
      return false;
    }
  }

  async getChannel(channelId: string): Promise<Channel | undefined> {
    return this.channels.get(channelId);
  }

  async getChannels(hubId: string): Promise<Channel[]> {
    return Array.from(this.channels.values())
      .filter(c => c.hubId === hubId)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  // Message Management
  async sendMessage(message: Omit<Message, 'id' | 'timestamp' | 'reactions' | 'replies'>): Promise<string> {
    try {
      const messageId = this.generateId();
      const newMessage: Message = {
        id: messageId,
        timestamp: new Date(),
        reactions: [],
        replies: [],
        ...message
      };

      const channelMessages = this.messages.get(message.channelId) || [];
      channelMessages.push(newMessage);
      this.messages.set(message.channelId, channelMessages);

      // Update channel activity
      const channel = this.channels.get(message.channelId);
      if (channel) {
        channel.lastActivity = new Date();
        channel.messageCount++;
      }

      // Process mentions
      await this.processMentions(newMessage);
      
      // Send notifications
      await this.sendMessageNotifications(newMessage);
      
      // Broadcast to connected clients
      this.broadcastToChannel(message.channelId, 'message', newMessage);

      this.emit('messageSent', { message: newMessage });
      return messageId;
    } catch (error) {
      this.emit('error', { operation: 'sendMessage', error });
      throw error;
    }
  }

  async editMessage(messageId: string, channelId: string, newContent: MessageContent): Promise<boolean> {
    try {
      const channelMessages = this.messages.get(channelId) || [];
      const messageIndex = channelMessages.findIndex(m => m.id === messageId);
      
      if (messageIndex === -1) {
        return false;
      }

      const message = channelMessages[messageIndex];
      message.content = newContent;
      message.editedAt = new Date();

      this.broadcastToChannel(channelId, 'messageEdited', message);
      this.emit('messageEdited', { message });
      
      return true;
    } catch (error) {
      this.emit('error', { operation: 'editMessage', error });
      return false;
    }
  }

  async deleteMessage(messageId: string, channelId: string): Promise<boolean> {
    try {
      const channelMessages = this.messages.get(channelId) || [];
      const messageIndex = channelMessages.findIndex(m => m.id === messageId);
      
      if (messageIndex === -1) {
        return false;
      }

      const message = channelMessages[messageIndex];
      message.deletedAt = new Date();

      this.broadcastToChannel(channelId, 'messageDeleted', { messageId, channelId });
      this.emit('messageDeleted', { messageId, channelId });
      
      return true;
    } catch (error) {
      this.emit('error', { operation: 'deleteMessage', error });
      return false;
    }
  }

  async getMessages(
    channelId: string,
    options: {
      limit?: number;
      before?: string;
      after?: string;
      around?: string;
    } = {}
  ): Promise<Message[]> {
    const channelMessages = this.messages.get(channelId) || [];
    let filteredMessages = channelMessages.filter(m => !m.deletedAt);

    if (options.before) {
      const beforeMessage = filteredMessages.find(m => m.id === options.before);
      if (beforeMessage) {
        filteredMessages = filteredMessages.filter(m => m.timestamp < beforeMessage.timestamp);
      }
    }

    if (options.after) {
      const afterMessage = filteredMessages.find(m => m.id === options.after);
      if (afterMessage) {
        filteredMessages = filteredMessages.filter(m => m.timestamp > afterMessage.timestamp);
      }
    }

    if (options.around) {
      const aroundMessage = filteredMessages.find(m => m.id === options.around);
      if (aroundMessage) {
        const index = filteredMessages.indexOf(aroundMessage);
        const start = Math.max(0, index - (options.limit || 50) / 2);
        const end = Math.min(filteredMessages.length, index + (options.limit || 50) / 2);
        filteredMessages = filteredMessages.slice(start, end);
      }
    }

    const limit = options.limit || 50;
    return filteredMessages
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  async addReaction(messageId: string, channelId: string, emoji: string, userId: string): Promise<boolean> {
    try {
      const channelMessages = this.messages.get(channelId) || [];
      const message = channelMessages.find(m => m.id === messageId);
      
      if (!message) {
        return false;
      }

      let reaction = message.reactions.find(r => r.emoji === emoji);
      if (!reaction) {
        reaction = {
          emoji,
          users: [],
          count: 0,
          timestamp: new Date()
        };
        message.reactions.push(reaction);
      }

      if (!reaction.users.includes(userId)) {
        reaction.users.push(userId);
        reaction.count++;
      }

      this.broadcastToChannel(channelId, 'reactionAdded', { messageId, reaction });
      this.emit('reactionAdded', { messageId, channelId, reaction });
      
      return true;
    } catch (error) {
      this.emit('error', { operation: 'addReaction', error });
      return false;
    }
  }

  async removeReaction(messageId: string, channelId: string, emoji: string, userId: string): Promise<boolean> {
    try {
      const channelMessages = this.messages.get(channelId) || [];
      const message = channelMessages.find(m => m.id === messageId);
      
      if (!message) {
        return false;
      }

      const reaction = message.reactions.find(r => r.emoji === emoji);
      if (!reaction) {
        return false;
      }

      const userIndex = reaction.users.indexOf(userId);
      if (userIndex !== -1) {
        reaction.users.splice(userIndex, 1);
        reaction.count--;
        
        if (reaction.count === 0) {
          const reactionIndex = message.reactions.indexOf(reaction);
          message.reactions.splice(reactionIndex, 1);
        }
      }

      this.broadcastToChannel(channelId, 'reactionRemoved', { messageId, emoji, userId });
      this.emit('reactionRemoved', { messageId, channelId, emoji, userId });
      
      return true;
    } catch (error) {
      this.emit('error', { operation: 'removeReaction', error });
      return false;
    }
  }

  // Voice/Video Calls
  async startCall(
    channelId: string,
    initiatorId: string,
    type: 'voice' | 'video' | 'screen_share',
    settings: Partial<CallSettings> = {}
  ): Promise<string> {
    try {
      const callId = this.generateId();
      const call: VoiceCall = {
        id: callId,
        channelId,
        participants: [
          {
            userId: initiatorId,
            joinedAt: new Date(),
            status: 'connected',
            permissions: {
              canSpeak: true,
              canVideo: true,
              canShareScreen: true,
              canRecord: true,
              canInvite: true,
              canMute: true,
              canKick: true
            },
            mediaState: {
              audioEnabled: true,
              videoEnabled: type === 'video',
              screenShareEnabled: type === 'screen_share',
              audioMuted: false,
              videoMuted: false,
              quality: 'auto'
            }
          }
        ],
        status: 'waiting',
        type,
        settings: {
          maxParticipants: 50,
          recordingEnabled: false,
          waitingRoom: false,
          muteOnJoin: false,
          requirePermissionToJoin: false,
          allowScreenShare: true,
          endCallForAll: true,
          ...settings
        },
        startedAt: new Date()
      };

      this.activeCalls.set(callId, call);
      
      this.broadcastToChannel(channelId, 'callStarted', call);
      this.emit('callStarted', { call });
      
      return callId;
    } catch (error) {
      this.emit('error', { operation: 'startCall', error });
      throw error;
    }
  }

  async joinCall(callId: string, userId: string): Promise<boolean> {
    try {
      const call = this.activeCalls.get(callId);
      if (!call) {
        throw new Error(`Call ${callId} not found`);
      }

      const existingParticipant = call.participants.find(p => p.userId === userId);
      if (existingParticipant) {
        return true;
      }

      if (call.participants.length >= call.settings.maxParticipants) {
        throw new Error('Call is full');
      }

      const participant: CallParticipant = {
        userId,
        joinedAt: new Date(),
        status: 'connecting',
        permissions: {
          canSpeak: true,
          canVideo: true,
          canShareScreen: true,
          canRecord: false,
          canInvite: false,
          canMute: false,
          canKick: false
        },
        mediaState: {
          audioEnabled: true,
          videoEnabled: call.type === 'video',
          screenShareEnabled: false,
          audioMuted: call.settings.muteOnJoin,
          videoMuted: false,
          quality: 'auto'
        }
      };

      call.participants.push(participant);
      
      if (call.status === 'waiting') {
        call.status = 'active';
      }

      this.broadcastToChannel(call.channelId, 'participantJoined', { callId, participant });
      this.emit('participantJoined', { callId, participant });
      
      return true;
    } catch (error) {
      this.emit('error', { operation: 'joinCall', error });
      return false;
    }
  }

  async leaveCall(callId: string, userId: string): Promise<boolean> {
    try {
      const call = this.activeCalls.get(callId);
      if (!call) {
        return false;
      }

      const participantIndex = call.participants.findIndex(p => p.userId === userId);
      if (participantIndex === -1) {
        return false;
      }

      const participant = call.participants[participantIndex];
      participant.leftAt = new Date();
      participant.status = 'disconnected';

      call.participants.splice(participantIndex, 1);

      if (call.participants.length === 0) {
        call.status = 'ended';
        call.endedAt = new Date();
        call.duration = call.endedAt.getTime() - call.startedAt.getTime();
        this.activeCalls.delete(callId);
      }

      this.broadcastToChannel(call.channelId, 'participantLeft', { callId, userId });
      this.emit('participantLeft', { callId, userId });
      
      return true;
    } catch (error) {
      this.emit('error', { operation: 'leaveCall', error });
      return false;
    }
  }

  async endCall(callId: string, endedBy: string): Promise<boolean> {
    try {
      const call = this.activeCalls.get(callId);
      if (!call) {
        return false;
      }

      call.status = 'ended';
      call.endedAt = new Date();
      call.duration = call.endedAt.getTime() - call.startedAt.getTime();

      // Mark all participants as left
      call.participants.forEach(p => {
        if (!p.leftAt) {
          p.leftAt = new Date();
          p.status = 'disconnected';
        }
      });

      this.activeCalls.delete(callId);
      
      this.broadcastToChannel(call.channelId, 'callEnded', { callId, endedBy });
      this.emit('callEnded', { callId, endedBy });
      
      return true;
    } catch (error) {
      this.emit('error', { operation: 'endCall', error });
      return false;
    }
  }

  // WebSocket Connection Management
  addConnection(userId: string, ws: WebSocket): void {
    this.wsConnections.set(userId, ws);
    
    // Update user presence
    this.updateUserPresence(userId, 'online');
    
    ws.on('close', () => {
      this.wsConnections.delete(userId);
      this.updateUserPresence(userId, 'offline');
    });

    ws.on('message', (data) => {
      this.handleWebSocketMessage(userId, data);
    });
  }

  private handleWebSocketMessage(userId: string, data: any): void {
    try {
      const message = JSON.parse(data.toString());
      
      switch (message.type) {
        case 'typing':
          this.handleTypingIndicator(userId, message.channelId, message.typing);
          break;
        case 'presence':
          this.updateUserPresence(userId, message.status, message.activity);
          break;
        case 'ping':
          this.sendToUser(userId, { type: 'pong', timestamp: Date.now() });
          break;
      }
    } catch (error) {
      this.emit('error', { operation: 'handleWebSocketMessage', error });
    }
  }

  private broadcastToChannel(channelId: string, type: string, data: any): void {
    const channel = this.channels.get(channelId);
    if (!channel) return;

    const message = { type, data, timestamp: Date.now() };
    
    for (const memberId of channel.members) {
      this.sendToUser(memberId, message);
    }
  }

  private sendToUser(userId: string, message: any): void {
    const ws = this.wsConnections.get(userId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  private async processMentions(message: Message): Promise<void> {
    for (const mention of message.mentions) {
      // Send notification to mentioned user
      await this.sendNotification(mention.targetId, {
        type: 'mention',
        channelId: message.channelId,
        messageId: message.id,
        senderId: message.senderId
      });
    }
  }

  private async sendMessageNotifications(message: Message): Promise<void> {
    const channel = this.channels.get(message.channelId);
    if (!channel) return;

    for (const memberId of channel.members) {
      if (memberId === message.senderId) continue;

      const preferences = this.notifications.get(`${memberId}:${channel.hubId}`);
      if (preferences && this.shouldSendNotification(preferences, message)) {
        await this.sendNotification(memberId, {
          type: 'message',
          channelId: message.channelId,
          messageId: message.id,
          senderId: message.senderId
        });
      }
    }
  }

  private shouldSendNotification(preferences: NotificationPreferences, message: Message): boolean {
    // Check if notifications are enabled
    if (!preferences.desktop && !preferences.mobile && !preferences.email) {
      return false;
    }

    // Check do not disturb
    if (preferences.doNotDisturb.enabled) {
      if (!preferences.doNotDisturb.until || preferences.doNotDisturb.until > new Date()) {
        return false;
      }
    }

    // Check schedule
    if (preferences.schedule.enabled) {
      const now = new Date();
      const currentTime = now.getHours() * 100 + now.getMinutes();
      const startTime = parseInt(preferences.schedule.allowedHours.start.replace(':', ''));
      const endTime = parseInt(preferences.schedule.allowedHours.end.replace(':', ''));
      
      if (currentTime < startTime || currentTime > endTime) {
        return false;
      }
    }

    // Check keywords
    if (preferences.keywords.length > 0) {
      const messageText = message.content.text?.toLowerCase() || '';
      return preferences.keywords.some(keyword => 
        messageText.includes(keyword.toLowerCase())
      );
    }

    return true;
  }

  private async sendNotification(userId: string, notification: any): Promise<void> {
    // Implementation would send actual notifications
    this.emit('notification', { userId, notification });
  }

  private handleTypingIndicator(userId: string, channelId: string, typing: boolean): void {
    this.broadcastToChannel(channelId, 'typing', { userId, typing });
  }

  private updateUserPresence(userId: string, status: string, activity?: string): void {
    // Update user presence in all hubs
    for (const hub of this.hubs.values()) {
      const member = hub.members.find(m => m.userId === userId);
      if (member) {
        member.status = status as any;
        member.presence.status = status as any;
        member.presence.lastSeen = new Date();
        
        if (activity) {
          member.presence.activity = activity;
        }
        
        member.lastActive = new Date();
      }
    }

    // Broadcast presence update
    this.emit('presenceUpdated', { userId, status, activity });
  }

  private async createDefaultChannels(hubId: string): Promise<void> {
    const defaultChannels = [
      {
        name: 'general',
        description: 'General discussion',
        type: 'text' as const,
        isPrivate: false
      },
      {
        name: 'random',
        description: 'Random conversations',
        type: 'text' as const,
        isPrivate: false
      }
    ];

    for (const channelData of defaultChannels) {
      await this.createChannel({
        ...channelData,
        hubId,
        members: [],
        moderators: [],
        settings: this.getDefaultChannelSettings(),
        permissions: this.getDefaultChannelPermissions(),
        createdBy: 'system'
      });
    }
  }

  private getDefaultChannelSettings(): ChannelSettings {
    return {
      autoDeleteMessages: false,
      autoDeleteAfter: 0,
      slowMode: false,
      slowModeDelay: 0,
      maxMessageLength: 2000,
      allowFiles: true,
      allowImages: true,
      allowVideos: true,
      allowEmojis: true,
      allowMentions: true,
      allowThreads: true
    };
  }

  private getDefaultChannelPermissions(): ChannelPermissions {
    return {
      canSendMessages: ['member', 'admin', 'owner'],
      canEditMessages: ['admin', 'owner'],
      canDeleteMessages: ['admin', 'owner'],
      canPinMessages: ['admin', 'owner'],
      canManageChannel: ['admin', 'owner'],
      canInviteMembers: ['member', 'admin', 'owner'],
      canKickMembers: ['admin', 'owner'],
      canStartVoiceCall: ['member', 'admin', 'owner'],
      canStartVideoCall: ['member', 'admin', 'owner'],
      canShareScreen: ['member', 'admin', 'owner']
    };
  }

  private getDefaultPermissions(role: string): string[] {
    const permissions: Record<string, string[]> = {
      owner: ['*'],
      admin: ['manage_channels', 'manage_members', 'manage_roles', 'send_messages', 'voice_connect'],
      member: ['send_messages', 'voice_connect', 'add_reactions'],
      guest: ['send_messages', 'add_reactions']
    };

    return permissions[role] || permissions.guest;
  }

  private async logAuditEvent(
    hubId: string,
    type: string,
    action: string,
    actor: string,
    target: string,
    details: Record<string, any>
  ): Promise<void> {
    const event: AuditEvent = {
      id: this.generateId(),
      hubId,
      type,
      action,
      actor,
      target,
      details,
      timestamp: new Date(),
      ipAddress: '127.0.0.1', // Would get from request
      userAgent: 'Claude MCP Server'
    };

    const hubAuditLog = this.auditLog.get(hubId) || [];
    hubAuditLog.push(event);
    this.auditLog.set(hubId, hubAuditLog);

    this.emit('auditEvent', { event });
  }

  private startPresenceTracking(): void {
    setInterval(() => {
      // Update presence for connected users
      for (const [userId] of this.wsConnections.entries()) {
        this.updateUserPresence(userId, 'online');
      }
    }, 30000); // Every 30 seconds
  }

  private startMessageCleanup(): void {
    setInterval(() => {
      this.cleanupOldMessages();
    }, 24 * 60 * 60 * 1000); // Daily cleanup
  }

  private cleanupOldMessages(): void {
    const retentionPeriod = 90 * 24 * 60 * 60 * 1000; // 90 days
    const cutoff = new Date(Date.now() - retentionPeriod);

    for (const [channelId, messages] of this.messages.entries()) {
      const filteredMessages = messages.filter(m => m.timestamp > cutoff);
      this.messages.set(channelId, filteredMessages);
    }
  }

  private startNotificationProcessor(): void {
    setInterval(() => {
      // Process queued notifications
      this.processNotificationQueue();
    }, 5000); // Every 5 seconds
  }

  private processNotificationQueue(): void {
    // Implementation would process notification queue
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2, 15);
  }
}

interface UserSession {
  userId: string;
  sessionId: string;
  connectedAt: Date;
  lastActivity: Date;
  ipAddress: string;
  userAgent: string;
}