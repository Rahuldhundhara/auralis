import { useEffect, useState, type ReactNode } from 'react';
import {
  AudioLines,
  Check,
  ChevronDown,
  ChevronUp,
  Disc3,
  Download,
  ExternalLink,
  FolderOpen,
  Gauge,
  HardDrive,
  Languages,
  LayoutPanelLeft,
  Link2,
  ListMusic,
  LogIn,
  LogOut,
  Monitor,
  Moon,
  Music2,
  Palette,
  Play,
  RotateCcw,
  Settings2,
  ShieldCheck,
  Sun,
  Terminal,
  Trash2,
  UserRound,
  CirclePlay,
  Zap,
} from 'lucide-react';
import type { LastFmState, Settings, ThemeMode } from '@shared/types';
import { useAppStore } from '../stores/app';
import { useNavStore, type SettingsTab } from '../stores/nav';
import { confirmDialog, toast, useUiStore } from '../stores/ui';
import { formatBytes, formatDate } from '../lib/format';
import { Button, IconButton, Range } from '../components/primitives';

const TABS: Array<{ id: SettingsTab; label: string; icon: ReactNode }> = [
  { id: 'general', label: 'General', icon: <Settings2 size={17} /> },
  { id: 'appearance', label: 'Appearance', icon: <Palette size={17} /> },
  { id: 'playback', label: 'Playback & EQ', icon: <AudioLines size={17} /> },
  { id: 'lyrics', label: 'Lyrics', icon: <Music2 size={17} /> },
  { id: 'downloads', label: 'Downloads', icon: <Download size={17} /> },
  { id: 'integrations', label: 'Integrations', icon: <Link2 size={17} /> },
  { id: 'account', label: 'Account', icon: <UserRound size={17} /> },
  { id: 'about', label: 'About', icon: <ShieldCheck size={17} /> },
];

const LANGUAGES = [
  ['en', 'English'],
  ['hi', 'हिन्दी (Hindi)'],
  ['es', 'Español'],
  ['fr', 'Français'],
  ['de', 'Deutsch'],
  ['ja', '日本語'],
  ['ko', '한국어'],
  ['pt', 'Português'],
  ['ar', 'العربية'],
  ['zh', '中文'],
  ['ru', 'Русский'],
  ['id', 'Bahasa Indonesia'],
  ['tr', 'Türkçe'],
];

const REGIONS = [
  ['US', 'United States'],
  ['IN', 'India'],
  ['GB', 'United Kingdom'],
  ['CA', 'Canada'],
  ['AU', 'Australia'],
  ['DE', 'Germany'],
  ['FR', 'France'],
  ['JP', 'Japan'],
  ['KR', 'South Korea'],
  ['BR', 'Brazil'],
  ['MX', 'Mexico'],
  ['AE', 'United Arab Emirates'],
  ['SG', 'Singapore'],
];

const TRANSLATION_LANGUAGES = [
  ['EN', 'English'],
  ['HI', 'Hindi'],
  ['ES', 'Spanish'],
  ['FR', 'French'],
  ['DE', 'German'],
  ['JA', 'Japanese'],
  ['KO', 'Korean'],
  ['PT', 'Portuguese'],
  ['AR', 'Arabic'],
  ['ZH', 'Chinese'],
  ['RU', 'Russian'],
  ['TR', 'Turkish'],
];

const PROVIDERS: Array<{ id: string; label: string; description: string }> = [
  { id: 'BetterLyrics', label: 'BetterLyrics', description: 'Community lyrics with word-by-word timing and translations.' },
  { id: 'LyricsPlus', label: 'LyricsPlus', description: 'Large community catalogue with synced and plain lyrics.' },
  { id: 'LrcLib', label: 'LRCLIB', description: 'Open, crowd-sourced lyrics database with timestamps.' },
  { id: 'KuGou', label: 'KuGou', description: 'Chinese catalogue with synced lyrics and translations.' },
  { id: 'YouTube', label: 'YouTube Music', description: 'The official lyrics tab from YouTube Music, when available.' },
  { id: 'YouTubeSubtitle', label: 'YouTube captions', description: 'Timed captions extracted with yt-dlp as a fallback.' },
  { id: 'Zemer', label: 'Zemer', description: 'Community lyrics for international releases.' },
];

const ACCENTS = [
  { value: '#8ab4f8', label: 'Auralis blue' },
  { value: '#7de2ff', label: 'Ice' },
  { value: '#c39bff', label: 'Violet' },
  { value: '#ff9bc0', label: 'Rose' },
  { value: '#7ee2b8', label: 'Mint' },
  { value: '#ffb27d', label: 'Amber' },
  { value: '#ff8f8f', label: 'Coral' },
  { value: '#b8e986', label: 'Lime' },
];

/* ------------------------------------------------------------------ */
/* Small controls                                                      */
/* ------------------------------------------------------------------ */

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (value: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      className={`toggle ${checked ? 'is-on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className="toggle-knob" />
    </button>
  );
}

function Select({
  value,
  onChange,
  children,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <div className="select-wrap">
      <select className="select" value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
        {children}
      </select>
      <ChevronDown size={15} />
    </div>
  );
}

function TextSetting({
  value,
  onSave,
  placeholder,
  type = 'text',
  disabled,
}: {
  value: string;
  onSave: (value: string) => void;
  placeholder?: string;
  type?: 'text' | 'password';
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <input
      className="text-input"
      type={type}
      value={draft}
      placeholder={placeholder}
      disabled={disabled}
      spellCheck={false}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        if (draft !== value) onSave(draft.trim());
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.currentTarget.blur();
        }
      }}
    />
  );
}

function SettingRow({
  label,
  description,
  children,
  stacked,
}: {
  label: string;
  description?: string;
  children?: ReactNode;
  stacked?: boolean;
}) {
  return (
    <div className={`setting-row ${stacked ? 'is-stacked' : ''}`}>
      <div className="setting-copy">
        <span className="setting-label">{label}</span>
        {description ? <span className="setting-description">{description}</span> : null}
      </div>
      {children ? <div className="setting-control">{children}</div> : null}
    </div>
  );
}

function SettingsCard({ title, description, children, icon }: { title: string; description?: string; children: ReactNode; icon?: ReactNode }) {
  return (
    <section className="settings-card">
      <header className="settings-card-head">
        {icon ? <span className="settings-card-icon">{icon}</span> : null}
        <div>
          <h2>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
      </header>
      <div className="settings-rows">{children}</div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Tabs                                                                */
/* ------------------------------------------------------------------ */

function GeneralTab() {
  const settings = useAppStore((state) => state.settings);
  const update = useAppStore((state) => state.updateSettings);
  const reset = useAppStore((state) => state.resetSettings);

  return (
    <>
      <SettingsCard title="Language & region" description="Controls the YouTube Music catalogue and metadata language." icon={<Languages size={19} />}>
        <SettingRow label="Content language" description="The language used for song titles, genres and editorial shelves.">
          <Select value={settings.language} onChange={(value) => void update({ language: value })}>
            {LANGUAGES.map(([value, label]) => (
              <option value={value} key={value}>
                {label}
              </option>
            ))}
          </Select>
        </SettingRow>
        <SettingRow label="Region" description="Charts, new releases and recommendations follow this country.">
          <Select value={settings.region} onChange={(value) => void update({ region: value })}>
            {REGIONS.map(([value, label]) => (
              <option value={value} key={value}>
                {label}
              </option>
            ))}
          </Select>
        </SettingRow>
        <SettingRow label="Start page" description="Where Auralis opens when you launch it.">
          <Select value={settings.startPage} onChange={(value) => void update({ startPage: value as Settings['startPage'] })}>
            <option value="home">Home</option>
            <option value="explore">Explore</option>
            <option value="library">Library</option>
          </Select>
        </SettingRow>
      </SettingsCard>

      <SettingsCard title="Window & system" description="How Auralis behaves with the rest of Windows." icon={<Monitor size={19} />}>
        <SettingRow label="System tray icon" description="Keep Auralis within reach from the notification area.">
          <Toggle checked={settings.trayEnabled} onChange={(value) => void update({ trayEnabled: value })} />
        </SettingRow>
        <SettingRow label="Close to tray" description="Closing the window keeps the music playing in the background.">
          <Toggle
            checked={settings.closeToTray}
            disabled={!settings.trayEnabled}
            onChange={(value) => void update({ closeToTray: value })}
          />
        </SettingRow>
        <SettingRow
          label="Hardware acceleration"
          description="Use the GPU for smooth artwork and animations. Requires a restart to take effect."
        >
          <Toggle checked={settings.hardwareAcceleration} onChange={(value) => void update({ hardwareAcceleration: value })} />
        </SettingRow>
        <SettingRow label="Restart Auralis" description="Apply graphics changes and reload the interface.">
          <Button variant="outline" size="sm" icon={<RotateCcw size={15} />} onClick={() => void window.auralis.app.relaunch()}>
            Restart now
          </Button>
        </SettingRow>
      </SettingsCard>

      <SettingsCard title="Reset" description="Return every preference to its original value." icon={<Trash2 size={19} />}>
        <SettingRow label="Reset all settings" description="Your library, downloads and account stay untouched.">
          <Button
            variant="danger"
            size="sm"
            icon={<RotateCcw size={15} />}
            onClick={() =>
              confirmDialog({
                title: 'Reset all settings?',
                message: 'Theme, playback, lyrics, downloads and integration settings will return to their defaults.',
                confirmLabel: 'Reset settings',
                danger: true,
                onConfirm: async () => {
                  await reset();
                },
              })
            }
          >
            Reset
          </Button>
        </SettingRow>
      </SettingsCard>
    </>
  );
}

function AppearanceTab() {
  const settings = useAppStore((state) => state.settings);
  const update = useAppStore((state) => state.updateSettings);
  const collapsed = useUiStore((state) => state.sidebarCollapsed);
  const setCollapsed = useUiStore((state) => state.setSidebarCollapsed);

  const themes: Array<{ id: ThemeMode; label: string; description: string; icon: ReactNode }> = [
    { id: 'dark', label: 'Dark', description: 'Soft charcoal surfaces', icon: <Moon size={18} /> },
    { id: 'black', label: 'Black', description: 'True black for OLED', icon: <Moon size={18} /> },
    { id: 'light', label: 'Light', description: 'Bright and airy', icon: <Sun size={18} /> },
    { id: 'system', label: 'System', description: 'Follow Windows', icon: <Monitor size={18} /> },
  ];

  return (
    <>
      <SettingsCard title="Theme" description="Auralis switches instantly. System follows your Windows appearance." icon={<Palette size={19} />}>
        <div className="theme-grid">
          {themes.map((theme) => (
            <button
              type="button"
              key={theme.id}
              className={`theme-card theme-${theme.id} ${settings.theme === theme.id ? 'is-active' : ''}`}
              onClick={() => void update({ theme: theme.id })}
            >
              <span className="theme-preview">
                <span className="theme-preview-side" />
                <span className="theme-preview-body">
                  <span />
                  <span />
                  <span />
                </span>
              </span>
              <span className="theme-card-text">
                <span className="theme-card-label">
                  {theme.icon}
                  {theme.label}
                  {settings.theme === theme.id ? <Check size={15} className="theme-check" /> : null}
                </span>
                <span className="theme-card-desc">{theme.description}</span>
              </span>
            </button>
          ))}
        </div>
      </SettingsCard>

      <SettingsCard title="Accent colour" description="Used for highlights, the player and active controls." icon={<Palette size={19} />}>
        <div className="accent-picker">
          {ACCENTS.map((accent) => (
            <button
              type="button"
              key={accent.value}
              className={`accent-swatch ${settings.accent.toLowerCase() === accent.value ? 'is-active' : ''}`}
              style={{ background: accent.value }}
              title={accent.label}
              aria-label={accent.label}
              onClick={() => void update({ accent: accent.value })}
            >
              {settings.accent.toLowerCase() === accent.value ? <Check size={15} /> : null}
            </button>
          ))}
          <label className="accent-custom" title="Choose any colour">
            <input
              type="color"
              value={settings.accent}
              onChange={(event) => void update({ accent: event.target.value })}
              aria-label="Custom accent colour"
            />
            <span style={{ background: settings.accent }} />
            <span>Custom</span>
          </label>
        </div>
        <div className="accent-hex">
          <span>Current colour</span>
          <code>{settings.accent.toUpperCase()}</code>
        </div>
      </SettingsCard>

      <SettingsCard title="Sidebar" description="Choose how much room your collection gets." icon={<LayoutPanelLeft size={19} />}>
        <SettingRow label="Collapse sidebar" description="Show icons only and give the music more space.">
          <Toggle
            checked={collapsed}
            onChange={(value) => {
              setCollapsed(value);
              void update({ sidebarCollapsed: value });
            }}
          />
        </SettingRow>
      </SettingsCard>
    </>
  );
}

const EQ_PRESETS: Array<{ label: string; bands: number[]; preamp: number }> = [
  { label: 'Flat', bands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], preamp: 0 },
  { label: 'Bass boost', bands: [9, 8, 6, 3, 0, 0, 0, 0, 0, 0], preamp: -2 },
  { label: 'Vocal', bands: [-2, -1, 0, 2, 4, 4, 3, 1, 0, 0], preamp: -1 },
  { label: 'Rock', bands: [5, 4, 2, 0, -1, -1, 1, 3, 4, 4], preamp: -2 },
  { label: 'Podcast', bands: [-4, -3, -1, 2, 5, 4, 2, 0, -2, -3], preamp: 0 },
  { label: 'Night', bands: [-2, -1, 0, 1, 2, 1, 0, -1, -2, -3], preamp: -2 },
];

function PlaybackTab() {
  const settings = useAppStore((state) => state.settings);
  const update = useAppStore((state) => state.updateSettings);
  const player = useAppStore((state) => state.settings.playbackRate);

  const setBand = (index: number, value: number) => {
    const bands = [...settings.eq.bands];
    bands[index] = value;
    void update({ eq: { ...settings.eq, bands } });
  };

  const applyPreset = (preset: (typeof EQ_PRESETS)[number]) => {
    void update({ eq: { ...settings.eq, bands: [...preset.bands], preamp: preset.preamp, bassBoost: false } });
  };

  return (
    <>
      <SettingsCard title="Audio quality" description="Streaming quality is resolved through yt-dlp for every track." icon={<Gauge size={19} />}>
        <SettingRow label="Streaming quality" description="Automatic picks the best available format for your connection.">
          <Select value={settings.audioQuality} onChange={(value) => void update({ audioQuality: value as Settings['audioQuality'] })}>
            <option value="auto">Automatic</option>
            <option value="best">Best available</option>
            <option value="high">High (256 kbps)</option>
            <option value="medium">Medium (128 kbps)</option>
            <option value="low">Data saver</option>
          </Select>
        </SettingRow>
        <SettingRow label="Normalise volume" description="Evens out loud and quiet tracks with a gentle compressor.">
          <Toggle checked={settings.normalize} onChange={(value) => void update({ normalize: value })} />
        </SettingRow>
        <SettingRow label="Playback speed" description={`Currently ${settings.playbackRate.toFixed(2)}×. Applies to the current and next songs.`}>
          <div className="setting-range">
            <Range min={0.5} max={2} step={0.05} value={settings.playbackRate} onValueChange={(value) => void update({ playbackRate: value })} />
            <span className="range-value">{settings.playbackRate.toFixed(2)}×</span>
          </div>
        </SettingRow>
        <SettingRow label="Gapless queue" description="The next track resolves while the current one is still playing.">
          <span className="setting-static">
            <Zap size={15} /> Always on
          </span>
        </SettingRow>
      </SettingsCard>

      <SettingsCard
        title="Equalizer"
        description="Ten peaking filters and a preamp, applied in real time through the Web Audio API."
        icon={<AudioLines size={19} />}
      >
        <SettingRow label="Enable equalizer" description="Bypass leaves the audio untouched.">
          <Toggle checked={settings.eq.enabled} onChange={(value) => void update({ eq: { ...settings.eq, enabled: value } })} />
        </SettingRow>
        <SettingRow label="Bass boost" description="Adds a low-end shelf on top of the 10-band curve.">
          <Toggle
            checked={settings.eq.bassBoost}
            onChange={(value) => void update({ eq: { ...settings.eq, bassBoost: value } })}
          />
        </SettingRow>
        <div className="eq-presets" role="group" aria-label="Equalizer presets">
          {EQ_PRESETS.map((preset) => (
            <button
              type="button"
              key={preset.label}
              className={`chip ${settings.eq.bands.join(',') === preset.bands.join(',') && settings.eq.preamp === preset.preamp ? 'is-selected' : ''}`}
              onClick={() => applyPreset(preset)}
            >
              {preset.label}
            </button>
          ))}
        </div>
        <div className={`eq-panel ${settings.eq.enabled ? '' : 'is-disabled'}`}>
          <div className="eq-head">
            <span>Preamp</span>
            <span className="eq-value">{settings.eq.preamp > 0 ? '+' : ''}{settings.eq.preamp.toFixed(1)} dB</span>
          </div>
          <Range
            min={-12}
            max={12}
            step={0.5}
            value={settings.eq.preamp}
            onValueChange={(value) => void update({ eq: { ...settings.eq, preamp: value } })}
          />
          <div className="eq-bands">
            {[31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000].map((frequency, index) => (
              <div className="eq-band" key={frequency}>
                <span className="eq-frequency">{frequency >= 1000 ? `${frequency / 1000}k` : frequency}</span>
                <Range
                  className="eq-range"
                  min={-12}
                  max={12}
                  step={0.5}
                  value={settings.eq.bands[index] || 0}
                  onValueChange={(value) => setBand(index, value)}
                  aria-label={`${frequency} Hz`}
                />
                <span className="eq-value">
                  {settings.eq.bands[index] > 0 ? '+' : ''}
                  {(settings.eq.bands[index] || 0).toFixed(1)}
                </span>
              </div>
            ))}
          </div>
          <div className="eq-footer">
            <span>31 Hz – 16 kHz · ±12 dB</span>
            <Button
              variant="ghost"
              size="sm"
              icon={<RotateCcw size={14} />}
              onClick={() => void update({ eq: { ...settings.eq, bands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], preamp: 0 } })}
            >
              Flatten
            </Button>
          </div>
        </div>
      </SettingsCard>

      <SettingsCard title="Player behaviour" description="Small touches that keep listening effortless." icon={<Play size={19} />}>
        <SettingRow label="Playback rate" description="The saved speed is restored the next time Auralis starts.">
          <span className="setting-static">{player.toFixed(2)}×</span>
        </SettingRow>
        <SettingRow label="Queue is remembered" description="Your queue, position and repeat mode survive a restart.">
          <span className="setting-static">
            <Check size={15} /> Enabled
          </span>
        </SettingRow>
      </SettingsCard>
    </>
  );
}

function LyricsTab() {
  const settings = useAppStore((state) => state.settings);
  const update = useAppStore((state) => state.updateSettings);
  const [testing, setTesting] = useState(false);
  const knownOrder = settings.lyricsProviders.filter((id) => PROVIDERS.some((provider) => provider.id === id));
  const order = knownOrder.length ? knownOrder : PROVIDERS.map((provider) => provider.id);
  const enabledProviders = new Set(order);
  const orderedProviders = [
    ...order
      .map((id) => PROVIDERS.find((provider) => provider.id === id))
      .filter((provider): provider is (typeof PROVIDERS)[number] => Boolean(provider)),
    ...PROVIDERS.filter((provider) => !enabledProviders.has(provider.id)),
  ];

  const setOrder = (next: string[]) => void update({ lyricsProviders: next });

  const toggleProvider = (id: string, enabled: boolean) => {
    if (enabled) setOrder([...order, id]);
    else if (order.length > 1) setOrder(order.filter((name) => name !== id));
    else toast('Keep at least one lyrics provider enabled.', 'info');
  };

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= order.length) return;
    const next = [...order];
    [next[index], next[target]] = [next[target], next[index]];
    setOrder(next);
  };

  const testTranslation = async () => {
    setTesting(true);
    try {
      const result = await window.auralis.lyrics.translate(['Hello, this is Auralis.'], settings.translation.targetLanguage);
      toast(result.lines[0] || 'Translation returned no text.', 'success');
    } catch (error: any) {
      toast(`Translation failed: ${error?.message || error}`, 'error');
    } finally {
      setTesting(false);
    }
  };

  return (
    <>
      <SettingsCard
        title="Lyrics providers"
        description="Auralis tries providers from top to bottom until synced lyrics are found. Drag-free ordering with the arrows."
        icon={<ListMusic size={19} />}
      >
        <div className="provider-list">
          {orderedProviders.map((provider) => {
            const enabled = enabledProviders.has(provider.id);
            const enabledIndex = order.indexOf(provider.id);
            return (
              <div className={`provider-row ${enabled ? '' : 'is-disabled'}`} key={provider.id}>
                <span className="provider-rank">{enabled ? enabledIndex + 1 : '—'}</span>
                <div className="provider-copy">
                  <span className="provider-name">{provider.label}</span>
                  <span className="provider-description">{provider.description}</span>
                </div>
                <div className="provider-controls">
                  <IconButton
                    label={`Move ${provider.label} up`}
                    size="xs"
                    disabled={!enabled || enabledIndex <= 0}
                    onClick={() => move(enabledIndex, -1)}
                  >
                    <ChevronUp size={14} />
                  </IconButton>
                  <IconButton
                    label={`Move ${provider.label} down`}
                    size="xs"
                    disabled={!enabled || enabledIndex < 0 || enabledIndex >= order.length - 1}
                    onClick={() => move(enabledIndex, 1)}
                  >
                    <ChevronDown size={14} />
                  </IconButton>
                  <Toggle checked={enabled} onChange={(value) => toggleProvider(provider.id, value)} />
                </div>
              </div>
            );
          })}
        </div>
        <div className="settings-inline-actions">
          <Button variant="ghost" size="sm" icon={<RotateCcw size={14} />} onClick={() => setOrder(PROVIDERS.map((provider) => provider.id))}>
            Restore recommended order
          </Button>
        </div>
      </SettingsCard>

      <SettingsCard title="Translation" description="Translate lyric lines with your own DeepL or OpenAI key. Keys stay on this PC." icon={<Languages size={19} />}>
        <SettingRow label="Auto-translate lyrics" description="Translate automatically when synced lyrics open, if a key is configured.">
          <Toggle checked={settings.translation.enabled} onChange={(value) => void update({ translation: { ...settings.translation, enabled: value } })} />
        </SettingRow>
        <SettingRow label="Provider">
          <Select
            value={settings.translation.provider}
            onChange={(value) => void update({ translation: { ...settings.translation, provider: value as 'deepl' | 'openai' } })}
          >
            <option value="deepl">DeepL</option>
            <option value="openai">OpenAI-compatible</option>
          </Select>
        </SettingRow>
        <SettingRow label="Target language">
          <Select
            value={settings.translation.targetLanguage.toUpperCase()}
            onChange={(value) => void update({ translation: { ...settings.translation, targetLanguage: value } })}
          >
            {TRANSLATION_LANGUAGES.map(([value, label]) => (
              <option value={value} key={value}>
                {label}
              </option>
            ))}
          </Select>
        </SettingRow>
        {settings.translation.provider === 'deepl' ? (
          <SettingRow label="DeepL API key" description="Free keys ending in :fx use the free API endpoint automatically." stacked>
            <TextSetting
              type="password"
              value={settings.translation.deeplApiKey}
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx:fx"
              onSave={(value) => void update({ translation: { ...settings.translation, deeplApiKey: value } })}
            />
          </SettingRow>
        ) : (
          <>
            <SettingRow label="Base URL" description="Any OpenAI-compatible endpoint works." stacked>
              <TextSetting
                value={settings.translation.openaiBaseUrl}
                placeholder="https://api.openai.com/v1"
                onSave={(value) =>
                  void update({ translation: { ...settings.translation, openaiBaseUrl: value || 'https://api.openai.com/v1' } })
                }
              />
            </SettingRow>
            <SettingRow label="API key" stacked>
              <TextSetting
                type="password"
                value={settings.translation.openaiApiKey}
                placeholder="sk-…"
                onSave={(value) => void update({ translation: { ...settings.translation, openaiApiKey: value } })}
              />
            </SettingRow>
            <SettingRow label="Model" stacked>
              <TextSetting
                value={settings.translation.openaiModel}
                placeholder="gpt-4o-mini"
                onSave={(value) => void update({ translation: { ...settings.translation, openaiModel: value || 'gpt-4o-mini' } })}
              />
            </SettingRow>
          </>
        )}
        <div className="settings-inline-actions">
          <Button variant="outline" size="sm" icon={<Languages size={15} />} onClick={() => void testTranslation()} disabled={testing}>
            {testing ? 'Testing…' : 'Test translation'}
          </Button>
        </div>
        <p className="settings-footnote">
          API keys are stored in your local Auralis settings file. They are only sent to the provider you select when you request a
          translation. Auralis never uploads listening data.
        </p>
      </SettingsCard>
    </>
  );
}

function DownloadsTab() {
  const settings = useAppStore((state) => state.settings);
  const library = useAppStore((state) => state.library);
  const update = useAppStore((state) => state.updateSettings);
  const clearDownloads = useAppStore((state) => state.clearDownloads);
  const openDialog = useUiStore((state) => state.openDialog);
  const done = library.downloads.filter((item) => item.status === 'done');
  const total = library.downloads.reduce((sum, item) => sum + (item.size || 0), 0);

  const chooseFolder = async () => {
    const folder = await window.auralis.app.chooseFolder(settings.downloadDir);
    if (folder) {
      await update({ downloadDir: folder });
      toast('Downloads folder updated.', 'success');
    }
  };

  return (
    <>
      <SettingsCard title="Storage" description="Downloads are saved as audio files that Auralis can play offline." icon={<HardDrive size={19} />}>
        <SettingRow label="Downloads folder" description={settings.downloadDir || 'Default Music\\Auralis folder'}>
          <div className="folder-control">
            <Button variant="outline" size="sm" icon={<FolderOpen size={15} />} onClick={() => void chooseFolder()}>
              Change
            </Button>
            <IconButton
              label="Open downloads folder"
              size="sm"
              onClick={() => void window.auralis.shell.openPath(settings.downloadDir || '')}
            >
              <FolderOpen size={16} />
            </IconButton>
          </div>
        </SettingRow>
        <SettingRow label="Download quality" description="Higher quality uses more disk space per song.">
          <Select value={settings.downloadQuality} onChange={(value) => void update({ downloadQuality: value as Settings['downloadQuality'] })}>
            <option value="best">Best available</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
          </Select>
        </SettingRow>
        <SettingRow label="Auto-download liked songs" description="Every song you like is saved locally in the background.">
          <Toggle checked={settings.autoDownloadLiked} onChange={(value) => void update({ autoDownloadLiked: value })} />
        </SettingRow>
        <SettingRow label="Offline storage used" description={`${done.length} completed · ${library.downloads.length} total entries`}>
          <span className="setting-static">{formatBytes(total) || '0 B'}</span>
        </SettingRow>
        <div className="settings-inline-actions">
          <Button variant="outline" size="sm" icon={<Download size={15} />} onClick={() => useNavStore.getState().navigate({ page: 'downloads' })}>
            Manage downloads
          </Button>
          <Button
            variant="danger"
            size="sm"
            icon={<Trash2 size={15} />}
            disabled={!library.downloads.length}
            onClick={() =>
              confirmDialog({
                title: 'Delete all downloads?',
                message: `${done.length} files will be removed from disk. This cannot be undone.`,
                confirmLabel: 'Delete files',
                danger: true,
                onConfirm: async () => {
                  await clearDownloads(true);
                  toast('Downloads cleared.', 'success');
                },
              })
            }
          >
            Clear downloads
          </Button>
        </div>
      </SettingsCard>

      <SettingsCard title="Network" description="A proxy is used by yt-dlp for streaming and downloads." icon={<Link2 size={19} />}>
        <SettingRow label="Proxy URL" description="Example: http://127.0.0.1:7890 or socks5://127.0.0.1:1080" stacked>
          <TextSetting
            value={settings.proxy}
            placeholder="Leave empty for a direct connection"
            onSave={(value) => void update({ proxy: value })}
          />
        </SettingRow>
        <p className="settings-footnote">Changes apply to the next track you play or download.</p>
      </SettingsCard>
    </>
  );
}

function IntegrationsTab() {
  const settings = useAppStore((state) => state.settings);
  const update = useAppStore((state) => state.updateSettings);
  const session = useAppStore((state) => state.session);
  const [lastfmState, setLastfmState] = useState<LastFmState | undefined>();
  const [auth, setAuth] = useState<{ token: string; url: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const refreshLastfm = async () => {
    try {
      setLastfmState(await window.auralis.lastfm.state());
    } catch {
      setLastfmState(undefined);
    }
  };

  useEffect(() => {
    void refreshLastfm();
  }, [settings.lastfm.sessionKey, settings.lastfm.apiKey, settings.lastfm.apiSecret]);

  const saveLastfm = (patch: Partial<Settings['lastfm']>) => {
    void update({ lastfm: { ...settings.lastfm, ...patch } });
  };

  const beginAuth = async () => {
    setBusy(true);
    try {
      const result = await window.auralis.lastfm.beginAuth();
      setAuth(result);
      await window.auralis.app.openExternal(result.url);
      toast('Authorize Auralis in your browser, then press “Finish connection”.', 'info');
    } catch (error: any) {
      toast(`Could not start Last.fm auth: ${error?.message || error}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  const completeAuth = async () => {
    if (!auth) return;
    setBusy(true);
    try {
      const state = await window.auralis.lastfm.completeAuth(auth.token);
      setLastfmState(state);
      setAuth(null);
      await refreshLastfm();
      toast('Last.fm connected.', 'success');
    } catch (error: any) {
      toast(`Last.fm authorization failed: ${error?.message || error}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    try {
      const state = await window.auralis.lastfm.disconnect();
      setLastfmState(state);
      await refreshLastfm();
      toast('Last.fm disconnected.', 'success');
    } catch (error: any) {
      toast(`Could not disconnect Last.fm: ${error?.message || error}`, 'error');
    }
  };

  return (
    <>
      <SettingsCard
        title="Last.fm"
        description="Scrobble plays and show a now-playing update on your Last.fm profile. Use your own API credentials."
        icon={<Music2 size={19} />}
      >
        <div className="integration-status">
          <span className={`status-dot ${lastfmState?.authenticated ? 'is-online' : ''}`} />
          <div>
            <strong>{lastfmState?.authenticated ? `Connected as ${lastfmState.username || settings.lastfm.username}` : lastfmState?.configured ? 'Credentials saved, not connected' : 'Not configured'}</strong>
            <span>Create an API account at last.fm/api/account/create to get a key and secret.</span>
          </div>
          <Button variant="ghost" size="sm" icon={<ExternalLink size={14} />} onClick={() => void window.auralis.app.openExternal('https://www.last.fm/api/account/create')}>
            Get keys
          </Button>
        </div>
        <SettingRow label="Enable scrobbling" description="Only plays that pass the threshold are sent to Last.fm.">
          <Toggle checked={settings.lastfm.enabled} disabled={!lastfmState?.authenticated} onChange={(value) => saveLastfm({ enabled: value })} />
        </SettingRow>
        <SettingRow label="API key" stacked>
          <TextSetting value={settings.lastfm.apiKey} placeholder="Last.fm API key" onSave={(value) => saveLastfm({ apiKey: value })} />
        </SettingRow>
        <SettingRow label="Shared secret" stacked>
          <TextSetting type="password" value={settings.lastfm.apiSecret} placeholder="Last.fm shared secret" onSave={(value) => saveLastfm({ apiSecret: value })} />
        </SettingRow>
        <SettingRow label="Now playing" description="Show the current song on your profile as soon as it starts.">
          <Toggle checked={settings.lastfm.nowPlaying} onChange={(value) => saveLastfm({ nowPlaying: value })} />
        </SettingRow>
        <SettingRow label="Scrobble after" description="Portion of a song that must be played before it is scrobbled.">
          <Select value={String(settings.scrobbleThreshold)} onChange={(value) => void update({ scrobbleThreshold: Number(value) })}>
            <option value="0.25">25%</option>
            <option value="0.5">50%</option>
            <option value="0.75">75%</option>
            <option value="0.9">90%</option>
          </Select>
        </SettingRow>
        <div className="settings-inline-actions">
          {!lastfmState?.authenticated ? (
            auth ? (
              <Button variant="primary" size="sm" icon={<Check size={15} />} onClick={() => void completeAuth()} disabled={busy}>
                Finish connection
              </Button>
            ) : (
              <Button variant="primary" size="sm" icon={<LogIn size={15} />} onClick={() => void beginAuth()} disabled={busy || !lastfmState?.configured}>
                Connect Last.fm
              </Button>
            )
          ) : (
            <Button variant="outline" size="sm" icon={<LogOut size={15} />} onClick={() => void disconnect()}>
              Disconnect
            </Button>
          )}
          {auth ? (
            <Button variant="ghost" size="sm" icon={<ExternalLink size={14} />} onClick={() => void window.auralis.app.openExternal(auth.url)}>
              Open authorization page
            </Button>
          ) : null}
        </div>
      </SettingsCard>

      <SettingsCard
        title="Discord Rich Presence"
        description="Show the song you are listening to on your Discord profile. Create your own Discord application first."
        icon={<Disc3 size={19} />}
      >
        <SettingRow label="Enable Rich Presence" description="Updates when a new song starts or playback pauses.">
          <Toggle checked={settings.discord.enabled} onChange={(value) => void update({ discord: { ...settings.discord, enabled: value } })} />
        </SettingRow>
        <SettingRow label="Discord application ID" stacked>
          <TextSetting
            value={settings.discord.appId}
            placeholder="123456789012345678"
            onSave={(value) => void update({ discord: { ...settings.discord, appId: value } })}
          />
        </SettingRow>
        <SettingRow label="Show buttons" description="Add an “Open in Auralis” button when Discord supports it.">
          <Toggle checked={settings.discord.showButtons} onChange={(value) => void update({ discord: { ...settings.discord, showButtons: value } })} />
        </SettingRow>
        <div className="settings-inline-actions">
          <Button variant="ghost" size="sm" icon={<ExternalLink size={14} />} onClick={() => void window.auralis.app.openExternal('https://discord.com/developers/applications')}>
            Discord Developer Portal
          </Button>
        </div>
        <p className="settings-footnote">Discord must be running on this PC. Rich Presence connects locally and never sends your listening data to Auralis.</p>
      </SettingsCard>

      <SettingsCard title="YouTube Music account" description="Your Google session unlocks likes, playlists and history sync." icon={<CirclePlay size={19} />}>
        <div className="integration-status">
          <span className={`status-dot ${session.hasCookies ? 'is-online' : ''}`} />
          <div>
            <strong>{session.hasCookies ? session.account?.name || 'Connected to YouTube Music' : 'Not connected'}</strong>
            <span>{session.hasCookies ? 'Likes and playlist changes sync to your account.' : 'Auralis works without an account; local features stay fully available.'}</span>
          </div>
        </div>
        <div className="settings-inline-actions">
          <Button variant="outline" size="sm" onClick={() => useUiStore.getState().openDialog({ type: 'cookie' })}>
            {session.hasCookies ? 'Manage session' : 'Connect account'}
          </Button>
          {session.hasCookies ? (
            <Button variant="ghost" size="sm" onClick={() => useNavStore.getState().navigate({ page: 'settings', tab: 'account' })}>
              Account details
            </Button>
          ) : null}
        </div>
      </SettingsCard>
    </>
  );
}

function AccountTab() {
  const session = useAppStore((state) => state.session);
  const login = useAppStore((state) => state.login);
  const clearSession = useAppStore((state) => state.clearSession);
  const library = useAppStore((state) => state.library);
  const openDialog = useUiStore((state) => state.openDialog);
  const [busy, setBusy] = useState(false);

  const signIn = async () => {
    setBusy(true);
    try {
      await login();
    } catch (error: any) {
      toast(`Sign in failed: ${error?.message || error}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  const signOut = () => {
    confirmDialog({
      title: 'Sign out of YouTube Music?',
      message: 'Your local library, playlists and downloads stay on this PC. Synced likes will stop updating.',
      confirmLabel: 'Sign out',
      danger: true,
      onConfirm: async () => {
        await clearSession();
      },
    });
  };

  return (
    <>
      <SettingsCard title="YouTube Music" description="Auralis signs in with a private Google window and stores only the cookies it needs." icon={<CirclePlay size={19} />}>
        {session.hasCookies ? (
          <div className="account-card">
            {session.account?.thumbnailUrl ? (
              <img src={session.account.thumbnailUrl} alt="" className="account-card-avatar" />
            ) : (
              <span className="account-card-avatar account-card-fallback">
                <UserRound size={30} />
              </span>
            )}
            <div className="account-card-copy">
              <span className="eyebrow">Connected account</span>
              <h2>{session.account?.name || 'YouTube Music'}</h2>
              <p>
                {session.account?.channelHandle || session.account?.email || 'Your session is active'}
                {session.account?.channelId ? ` · ${session.account.channelId}` : ''}
              </p>
            </div>
            <div className="account-card-actions">
              <Button variant="outline" size="sm" icon={<ExternalLink size={15} />} onClick={() => openDialog({ type: 'cookie' })}>
                Manage
              </Button>
              <Button variant="ghost" size="sm" icon={<LogOut size={15} />} onClick={signOut}>
                Sign out
              </Button>
            </div>
          </div>
        ) : (
          <div className="account-empty">
            <span className="account-empty-icon">
              <CirclePlay size={30} />
            </span>
            <div>
              <h2>Connect your YouTube Music account</h2>
              <p>
                Sign in to like songs, edit playlists, view your history and sync everything with the YouTube Music app. Auralis uses a
                separate Google window and never sees your password.
              </p>
            </div>
            <div className="account-empty-actions">
              <Button variant="primary" icon={<LogIn size={16} />} onClick={() => void signIn()} disabled={busy}>
                {busy ? 'Waiting for sign in…' : 'Sign in with Google'}
              </Button>
              <Button variant="outline" onClick={() => openDialog({ type: 'cookie' })}>
                Paste cookies
              </Button>
            </div>
          </div>
        )}
      </SettingsCard>

      <SettingsCard title="Local library" description="Auralis keeps this data on your PC, even without an account." icon={<HardDrive size={19} />}>
        <div className="account-stats">
          <div>
            <strong>{library.liked.length}</strong>
            <span>Liked songs</span>
          </div>
          <div>
            <strong>{library.playlists.length}</strong>
            <span>Playlists</span>
          </div>
          <div>
            <strong>{library.savedAlbums.length}</strong>
            <span>Albums</span>
          </div>
          <div>
            <strong>{library.savedArtists.length}</strong>
            <span>Artists</span>
          </div>
          <div>
            <strong>{library.downloads.length}</strong>
            <span>Downloads</span>
          </div>
        </div>
        <p className="settings-footnote">
          Liked songs are stored twice: in your local Auralis library and, when connected, in YouTube Music. Removing a like updates
          both.
        </p>
      </SettingsCard>

      <SettingsCard title="Privacy" description="What leaves this computer." icon={<ShieldCheck size={19} />}>
        <div className="privacy-list">
          <div>
            <Check size={15} />
            <span>YouTube Music requests use your own session. No Auralis account is required.</span>
          </div>
          <div>
            <Check size={15} />
            <span>Audio is streamed through yt-dlp directly from YouTube. Auralis hosts no music.</span>
          </div>
          <div>
            <Check size={15} />
            <span>Song identification sends only a fingerprint, never the original recording.</span>
          </div>
          <div>
            <Check size={15} />
            <span>Lyrics translation contacts the provider you configure, and only when you request it.</span>
          </div>
        </div>
      </SettingsCard>
    </>
  );
}

function AboutTab() {
  const appInfo = useAppStore((state) => state.appInfo);
  const [updating, setUpdating] = useState(false);

  const updateYtdlp = async () => {
    setUpdating(true);
    try {
      const message = await window.auralis.player.ytdlpUpdate();
      toast(message || 'yt-dlp updated.', 'success');
      const info = await window.auralis.app.info();
      useAppStore.setState({ appInfo: info });
    } catch (error: any) {
      toast(`Could not update yt-dlp: ${error?.message || error}`, 'error');
    } finally {
      setUpdating(false);
    }
  };

  return (
    <>
      <section className="about-hero">
        <div className="about-logo">
          <img src="./icon.png" alt="Auralis" />
        </div>
        <div>
          <span className="eyebrow">Auralis for Windows</span>
          <h1>Auralis</h1>
          <p>A calm, local-first desktop client for YouTube Music. Built with an independent brand and GPL-licensed code.</p>
          <span className="about-version">Version {appInfo?.version || '1.0.0'} · GPL-3.0-or-later</span>
        </div>
      </section>

      <SettingsCard title="Build details" description="Runtime versions and local storage locations." icon={<Terminal size={19} />}>
        <div className="about-grid">
          <div>
            <span>Electron</span>
            <code>{appInfo?.electron || '—'}</code>
          </div>
          <div>
            <span>Chromium</span>
            <code>{appInfo?.chrome || '—'}</code>
          </div>
          <div>
            <span>Platform</span>
            <code>{appInfo?.platform || 'win32'}</code>
          </div>
          <div>
            <span>yt-dlp</span>
            <code>{appInfo?.ytDlpVersion || 'bundled'}</code>
          </div>
          <div>
            <span>ffmpeg</span>
            <code>{appInfo?.ffmpegAvailable ? 'Available' : 'Not found'}</code>
          </div>
          <div>
            <span>User data</span>
            <code className="is-path" title={appInfo?.userData}>
              {appInfo?.userData || '—'}
            </code>
          </div>
          <div className="is-wide">
            <span>Downloads</span>
            <code className="is-path" title={appInfo?.downloadsDir}>
              {appInfo?.downloadsDir || '—'}
            </code>
          </div>
        </div>
        <div className="settings-inline-actions">
          <Button variant="outline" size="sm" icon={<FolderOpen size={15} />} onClick={() => void window.auralis.shell.openPath(appInfo?.userData || '')}>
            Open data folder
          </Button>
          <Button variant="outline" size="sm" icon={<Terminal size={15} />} onClick={() => void updateYtdlp()} disabled={updating}>
            {updating ? 'Updating yt-dlp…' : 'Update yt-dlp'}
          </Button>
        </div>
      </SettingsCard>

      <SettingsCard title="Credits" description="Auralis stands on the shoulders of open tools." icon={<Music2 size={19} />}>
        <div className="credits-list">
          <div>
            <strong>Electron, React & Vite</strong>
            <span>The desktop shell and interface runtime.</span>
          </div>
          <div>
            <strong>yt-dlp & ffmpeg</strong>
            <span>Audio resolution, downloads, decoding and captions.</span>
          </div>
          <div>
            <strong>Shazam fingerprinting</strong>
            <span>On-device song identification from a TypeScript port of the Shazam algorithm.</span>
          </div>
          <div>
            <strong>YouTube Music</strong>
            <span>Music catalogue and streaming. Auralis is not affiliated with YouTube or Google.</span>
          </div>
        </div>
        <div className="settings-inline-actions">
          <Button variant="ghost" size="sm" icon={<ExternalLink size={14} />} onClick={() => void window.auralis.app.openExternal('https://music.youtube.com')}>
            YouTube Music
          </Button>
          <Button variant="ghost" size="sm" icon={<ExternalLink size={14} />} onClick={() => void window.auralis.app.openExternal('https://www.gnu.org/licenses/gpl-3.0.html')}>
            GPL-3.0 license
          </Button>
        </div>
      </SettingsCard>

      <div className="about-footer">
        <span>Made for Windows · {formatDate(Date.now())}</span>
        <span>Support the artists you love by listening on official platforms.</span>
      </div>
    </>
  );
}

export function SettingsPage({ tab: initialTab }: { tab?: SettingsTab }) {
  const tab: SettingsTab = TABS.some((entry) => entry.id === initialTab) ? (initialTab as SettingsTab) : 'general';
  const navigate = useNavStore((state) => state.navigate);
  const current = TABS.find((entry) => entry.id === tab) || TABS[0];

  return (
    <div className="page settings-page">
      <header className="page-hero settings-hero">
        <div>
          <span className="eyebrow">
            <Settings2 size={14} /> Preferences
          </span>
          <h1>Settings</h1>
          <p>Shape Auralis around your library, your audio gear and the way you listen.</p>
        </div>
      </header>

      <div className="settings-layout">
        <nav className="settings-nav" aria-label="Settings sections">
          {TABS.map((entry) => (
            <button
              type="button"
              key={entry.id}
              className={`settings-nav-item ${tab === entry.id ? 'is-active' : ''}`}
              onClick={() => navigate({ page: 'settings', tab: entry.id }, true)}
            >
              <span className="settings-nav-icon">{entry.icon}</span>
              <span>{entry.label}</span>
            </button>
          ))}
        </nav>

        <div className="settings-panel">
          <div className="settings-panel-head">
            <span className="settings-panel-icon">{current.icon}</span>
            <div>
              <h2>{current.label}</h2>
              <p>{TAB_DESCRIPTIONS[tab]}</p>
            </div>
          </div>
          {tab === 'general' ? <GeneralTab /> : null}
          {tab === 'appearance' ? <AppearanceTab /> : null}
          {tab === 'playback' ? <PlaybackTab /> : null}
          {tab === 'lyrics' ? <LyricsTab /> : null}
          {tab === 'downloads' ? <DownloadsTab /> : null}
          {tab === 'integrations' ? <IntegrationsTab /> : null}
          {tab === 'account' ? <AccountTab /> : null}
          {tab === 'about' ? <AboutTab /> : null}
        </div>
      </div>
    </div>
  );
}

const TAB_DESCRIPTIONS: Record<SettingsTab, string> = {
  general: 'Language, region, startup and Windows behaviour.',
  appearance: 'Theme, accent colour and sidebar layout.',
  playback: 'Streaming quality, volume, speed and the ten-band equalizer.',
  lyrics: 'Provider order, translations and lyric keys.',
  downloads: 'Offline storage, quality and network proxy.',
  integrations: 'Last.fm, Discord and your YouTube Music session.',
  account: 'Your connected account and local library.',
  about: 'Versions, bundled tools and open-source credits.',
};
