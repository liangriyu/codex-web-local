import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

async function read(path) {
  return readFile(new URL(path, import.meta.url), 'utf8')
}

test('app renders sidebar account switcher component', async () => {
  const app = await read('../src/App.vue')
  const component = await read('../src/components/sidebar/SidebarAccountSwitcher.vue')

  assert.match(component, /account-switcher/)
  assert.match(component, /defineProps/)
  assert.match(component, /暂无账号档案/)
  assert.match(component, /当前 Web 运行时/)
  assert.match(component, /formatProfileLabel\(/)
  assert.match(component, /emit\('switch'/)
  assert.match(component, /emit\('align'/)
  assert.match(component, /emit\('remove'/)
  assert.match(component, /onAddByEmailLogin\(/)
  assert.match(component, /邮箱登录新增档案/)
  assert.match(component, /onSwitch\(/)
  assert.match(component, /onRemove\(/)
  assert.match(component, /visibleProfiles/)
  assert.match(component, /isCurrentAccountProfile\(/)
  assert.match(component, /切换到该账号/)
  assert.match(component, /切换/)
  assert.doesNotMatch(component, /Access Token/)
  assert.match(component, /profile\.profileId === props\.activeAccountProfileId/)
  assert.match(component, /if \(!normalizedProfileId \|\| normalizedProfileId === props\.activeAccountProfileId\) return/)
  assert.match(component, /当前档案不可删除/)
  assert.match(app, /SidebarAccountSwitcher/)
  assert.match(app, /:account-profiles=\"accountProfiles\"/)
  assert.match(app, /:active-account-profile-id=\"activeAccountProfileId\"/)
  assert.match(app, /@switch=\"onSwitchAccountProfile\"/)
  assert.match(app, /@align=\"onAlignAccount\"/)
  assert.match(app, /@remove=\"onRemoveAccountProfile\"/)
  assert.doesNotMatch(app, /function onAddAccountProfile\(/)
  assert.match(app, /function onRemoveAccountProfile\(/)
  assert.match(app, /function scheduleAccountAlignmentRefresh\(\): void/)
  assert.match(app, /window\.setInterval\(/)
  assert.match(app, /scheduleAccountAlignmentRefresh\(\)/)
})
