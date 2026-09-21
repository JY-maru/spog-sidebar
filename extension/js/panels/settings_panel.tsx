// panels/settings_panel.tsx
// [MOCK] ⚙️ 설정 패널 — 사이드바 자체의 환경설정(알림 on/off, 테마,
// 알림채널 자동참여 강제 여부 등). 다른 패널과 달리 백엔드 상태를 반영하지
// 않는 순수 로컬 설정이 대부분이라 별도 서버 동기화 로직이 없다. mock에서는
// 단순화를 위해 zustand 스토어 없이 localStorage를 직접 읽고 쓰는 controlled
// component로 표현했다 — 실제 SettingsPanel.tsx도 동일한 방식인지는 이번
// 조사 범위에서 직접 확인하지 못했다.
import { useState } from 'react';

const SETTINGS_KEYS = { NOTIFICATIONS: 'spog-notifications-enabled', THEME: 'spog-theme', QUEUE_AUTO_ENFORCE: 'spog-queue-auto-enforce' };

function loadSettings() {
  return {
    notificationsEnabled: localStorage.getItem(SETTINGS_KEYS.NOTIFICATIONS) !== 'false',
    theme: localStorage.getItem(SETTINGS_KEYS.THEME) || 'light',
    queueAutoEnforce: localStorage.getItem(SETTINGS_KEYS.QUEUE_AUTO_ENFORCE) === 'true',
  };
}
function toggleNotifications(enabled: boolean) {
  localStorage.setItem(SETTINGS_KEYS.NOTIFICATIONS, String(enabled));
}
function setTheme(theme: string) {
  localStorage.setItem(SETTINGS_KEYS.THEME, theme);
  document.documentElement.dataset.theme = theme;
}
function toggleQueueAutoEnforce(enabled: boolean) {
  localStorage.setItem(SETTINGS_KEYS.QUEUE_AUTO_ENFORCE, String(enabled));
  chrome.runtime.sendMessage({ type: 'SET_QUEUE_AUTO_ENFORCE', enabled });
}

export function SettingsPanel() {
  const [settings, setSettings] = useState(loadSettings);

  return (
    <div id="panel-settings" className="spog-panel">
      <label>
        <input
          id="settings-notifications-toggle"
          type="checkbox"
          checked={settings.notificationsEnabled}
          onChange={(e) => { toggleNotifications(e.target.checked); setSettings(loadSettings()); }}
        />
        알림 사용
      </label>
      <select
        id="settings-theme-select"
        value={settings.theme}
        onChange={(e) => { setTheme(e.target.value); setSettings(loadSettings()); }}
      >
        <option value="light">라이트</option>
        <option value="dark">다크</option>
      </select>
      <label>
        <input
          id="settings-queue-enforce-toggle"
          type="checkbox"
          checked={settings.queueAutoEnforce}
          onChange={(e) => { toggleQueueAutoEnforce(e.target.checked); setSettings(loadSettings()); }}
        />
        알림채널 자동참여 강제
      </label>
    </div>
  );
}

export const settingsActions = { toggleNotifications, setTheme, toggleQueueAutoEnforce, loadSettings };
