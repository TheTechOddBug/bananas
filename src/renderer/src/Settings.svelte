<script lang="ts">
  import { onMount } from 'svelte'
  import ColorPicker from 'svelte-awesome-color-picker'
  import { L } from './translations'
  import { appState } from './appState.svelte'
  import { debugLog } from './debugLog.svelte'
  import { DEFAULT_EMERGENCY_HOTKEY, type EmergencyHotkey } from './session/emergencyHotkey'
  import MacSidecarPermissions from './MacSidecarPermissions.svelte'

  let foregroundPreviewIcon: HTMLElement | undefined = $state()
  let backgroundPreviewIcon: HTMLElement | undefined = $state()
  let usernameValue = $state('Kiwi')
  let foregroundValue = $state('#ffffff')
  let backgroundValue = $state('#0099ff')
  let language = $state('en')
  const languageOptions = ['en', 'de', 'fr', 'pt-br', 'zh']
  let iceServersValue = $state('{ "urls": "stun:stun.l.google.com:19302" }')
  let modalSuccessIsActive = $state(false)
  let modalFailureIsActive = $state(false)
  let isMicrophoneEnabledOnConnect = $state(true)
  let recordRemoteScreen = $state(false)
  let hardwareVideoAcceleration = $state(true)
  let debugLogsEnabled = $state(false)
  let e2eeEnabled = $state(true)
  let mediaE2eeEnabled = $state(true)
  let cameraDeviceId = $state('')
  let microphoneDeviceId = $state('')
  let bonjourEnabled = $state(false)
  let bonjourServerUrl = $state('https://bonjour.p2p.kiwi')
  let emergencyHotkey = $state<EmergencyHotkey>({ ...DEFAULT_EMERGENCY_HOTKEY })
  let cameras = $state<MediaDeviceInfo[]>([])
  let microphones = $state<MediaDeviceInfo[]>([])
  const isLinux = window.electron.process.platform === 'linux'
  const isMac = window.electron.process.platform === 'darwin'

  const isUsernameValid = $derived(usernameValue.length > 0 && usernameValue.length < 32)
  const isForegroundValid = $derived(/^#[0-9A-F]{6}$/i.test(foregroundValue))
  const isBackgroundValid = $derived(/^#[0-9A-F]{6}$/i.test(backgroundValue))
  const isIceServersValid = $derived(
    iceServersValue.split('\n').every((serverObject) => {
      try {
        const srv = JSON.parse(serverObject)
        return srv.urls && srv.urls.length > 0
      } catch {
        return false
      }
    })
  )

  $effect(() => {
    if (isForegroundValid) {
      foregroundPreviewIcon?.style.setProperty('--color', foregroundValue)
    }
    if (isBackgroundValid) {
      backgroundPreviewIcon?.style.setProperty('--color', backgroundValue)
    }
  })

  $effect(() => {
    if (e2eeEnabled) mediaE2eeEnabled = true
  })

  async function onSubmit(evt: Event): Promise<void> {
    evt.preventDefault()
    if (isUsernameValid && isForegroundValid && isBackgroundValid && isIceServersValid) {
      await window.KiwiApi.updateSettings({
        username: usernameValue,
        foregroundColor: foregroundValue,
        backgroundColor: backgroundValue,
        language,
        isMicrophoneEnabledOnConnect,
        recordRemoteScreen,
        hardwareVideoAcceleration,
        debugLogsEnabled,
        e2eeEnabled,
        mediaE2eeEnabled: e2eeEnabled ? true : mediaE2eeEnabled,
        cameraDeviceId,
        microphoneDeviceId,
        iceServers: iceServersValue.split('\n').map((srv) => JSON.parse(srv)),
        bonjourEnabled,
        bonjourServerUrl,
        emergencyHotkey: Object.assign({}, emergencyHotkey)
      })
      appState.debugLogsEnabled = debugLogsEnabled
      appState.bonjourEnabled = bonjourEnabled
      debugLog.setEnabled(debugLogsEnabled)
      if (!debugLogsEnabled && appState.activeView === 'debug') appState.activeView = 'settings'
      if (!bonjourEnabled && appState.activeView === 'bonjour') appState.activeView = 'settings'
      if (debugLogsEnabled) debugLog.info('settings', 'debug logs enabled')
      modalSuccessIsActive = true
      setTimeout(() => {
        modalSuccessIsActive = false
      }, 2000)
    } else {
      modalFailureIsActive = true
      setTimeout(() => {
        modalFailureIsActive = false
      }, 2000)
    }
  }
  onMount(() => {
    const onDeviceChange = (): void => {
      void refreshMediaDevices()
    }
    void (async (): Promise<void> => {
      const settings = await window.KiwiApi.getSettings()
      usernameValue = settings.username
      foregroundValue = settings.foregroundColor
      backgroundValue = settings.backgroundColor
      language = settings.language
      isMicrophoneEnabledOnConnect = settings.isMicrophoneEnabledOnConnect
      recordRemoteScreen = settings.recordRemoteScreen === true
      hardwareVideoAcceleration = settings.hardwareVideoAcceleration
      debugLogsEnabled = settings.debugLogsEnabled
      e2eeEnabled = settings.e2eeEnabled !== false
      mediaE2eeEnabled = settings.mediaE2eeEnabled !== false
      cameraDeviceId = settings.cameraDeviceId ?? ''
      microphoneDeviceId = settings.microphoneDeviceId ?? ''
      iceServersValue = settings.iceServers.map((srv) => JSON.stringify(srv)).join('\n')
      bonjourEnabled = settings.bonjourEnabled === true
      bonjourServerUrl = settings.bonjourServerUrl || 'https://bonjour.p2p.kiwi'
      if (settings.emergencyHotkey) emergencyHotkey = settings.emergencyHotkey
      await refreshMediaDevices()
    })()
    navigator.mediaDevices.addEventListener('devicechange', onDeviceChange)
    return (): void => {
      navigator.mediaDevices.removeEventListener('devicechange', onDeviceChange)
    }
  })

  const unlockMediaLabels = async (): Promise<void> => {
    const tryGet = async (constraints: MediaStreamConstraints): Promise<boolean> => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints)
        for (const track of stream.getTracks()) track.stop()
        return true
      } catch {
        return false
      }
    }
    if (
      await tryGet({
        audio: true,
        video: true
      })
    ) {
      return
    }
    if (await tryGet({ audio: true })) return
    await tryGet({ video: true })
  }

  const refreshMediaDevices = async (): Promise<void> => {
    await unlockMediaLabels()
    const devices = await navigator.mediaDevices.enumerateDevices()
    cameras = devices.filter((device) => device.kind === 'videoinput' && device.deviceId)
    microphones = devices.filter((device) => device.kind === 'audioinput' && device.deviceId)
  }

  const deviceLabel = (device: MediaDeviceInfo, index: number): string =>
    device.label || `${device.kind} ${index + 1}`
</script>

<dialog class="modal" class:modal-open={modalSuccessIsActive}>
  <div class="modal-box">
    <h3 class="text-lg font-bold text-success">Success</h3>
    <p>Settings successfully saved.</p>
  </div>
</dialog>

<dialog class="modal" class:modal-open={modalFailureIsActive}>
  <div class="modal-box">
    <h3 class="text-lg font-bold text-error">Failure</h3>
    <p>Settings could not be saved.</p>
  </div>
</dialog>

<div class="container mx-auto p-5">
  <h1 class="text-3xl font-bold mb-4">{L.settings()}</h1>
  <form class="flex flex-col gap-4 max-w-xl" onsubmit={onSubmit}>
    <div class="tabs tabs-box">
      <input type="radio" name="settings_tab" class="tab" aria-label={L.basic()} checked />
      <div class="tab-content bg-base-100 border-base-300 p-6">
        <fieldset class="fieldset">
          <legend class="fieldset-legend">{L.username()}</legend>
          <label class="input w-full {isUsernameValid ? 'input-success' : 'input-error'}">
            <i class="fas fa-user"></i>
            <input bind:value={usernameValue} type="text" id="username" placeholder="Kiwi" />
          </label>
        </fieldset>
        <fieldset class="fieldset">
          <legend class="fieldset-legend">{L.foreground_color()}</legend>
          <label class="input w-full {isForegroundValid ? 'input-success' : 'input-error'}">
            <i bind:this={foregroundPreviewIcon} class="fas fa-palette color-preview"></i>
            <input bind:value={foregroundValue} type="text" id="foreground_color" placeholder="#1a1a1a" />
          </label>
          <ColorPicker bind:hex={foregroundValue} isTextInput={false} isAlpha={false} />
        </fieldset>
        <fieldset class="fieldset">
          <legend class="fieldset-legend">{L.background_color()}</legend>
          <label class="input w-full {isBackgroundValid ? 'input-success' : 'input-error'}">
            <i bind:this={backgroundPreviewIcon} class="fas fa-palette color-preview"></i>
            <input bind:value={backgroundValue} type="text" id="background_color" placeholder="#ffffff" />
          </label>
          <ColorPicker bind:hex={backgroundValue} isTextInput={false} isAlpha={false} />
        </fieldset>
        <fieldset class="fieldset">
          <legend class="fieldset-legend">{L.language()}</legend>
          <select class="select w-full" bind:value={language}>
            {#each languageOptions as lang}
              <option>{lang}</option>
            {/each}
          </select>
          <p class="label">{L.language_description()}</p>
        </fieldset>
        {#if isMac}
          <h2 class="text-xl font-semibold mt-2">{L.remote_control()}</h2>
          <MacSidecarPermissions />
        {/if}
      </div>
      <input type="radio" name="settings_tab" class="tab" aria-label={L.media()} />
      <div class="tab-content bg-base-100 border-base-300 p-6">
        <fieldset class="fieldset">
          <legend class="fieldset-legend">{L.camera_device()}</legend>
          <select class="select w-full" bind:value={cameraDeviceId} id="camera_device">
            <option value="">{L.default_media_device()}</option>
            {#each cameras as device, index (device.deviceId)}
              <option value={device.deviceId}>{deviceLabel(device, index)}</option>
            {/each}
          </select>
        </fieldset>
        <fieldset class="fieldset">
          <legend class="fieldset-legend">{L.microphone_device()}</legend>
          <select class="select w-full" bind:value={microphoneDeviceId} id="microphone_device">
            <option value="">{L.default_media_device()}</option>
            {#each microphones as device, index (device.deviceId)}
              <option value={device.deviceId}>{deviceLabel(device, index)}</option>
            {/each}
          </select>
        </fieldset>
        <fieldset class="fieldset">
          <label class="label cursor-pointer justify-start gap-2">
            <input
              bind:checked={isMicrophoneEnabledOnConnect}
              class="checkbox"
              type="checkbox"
              id="microphone_active_on_connect"
            />
            {L.is_microphone_active_on_connect()}
          </label>
        </fieldset>
        <fieldset class="fieldset">
          <div class="tooltip tooltip-top" data-tip={L.record_remote_screen_description()}>
          <label class="label cursor-pointer justify-start gap-2">
            <input
              bind:checked={recordRemoteScreen}
              class="checkbox"
              type="checkbox"
              id="record_remote_screen"
            />
            {L.record_remote_screen()}
          </label>
          </div>
        </fieldset>
        {#if isLinux}
          <fieldset class="fieldset">
            <div class="tooltip tooltip-top" data-tip={L.hardware_video_acceleration_description()}>
              <label class="label cursor-pointer justify-start gap-2">
                <input
                  bind:checked={hardwareVideoAcceleration}
                  class="checkbox"
                  type="checkbox"
                  id="hardware_video_acceleration"
                />
                {L.hardware_video_acceleration()}
              </label>
            </div>
          </fieldset>
        {/if}
      </div>
      <input type="radio" name="settings_tab" class="tab" aria-label={L.advanced()} />
      <div class="tab-content bg-base-100 border-base-300 p-6">
        <fieldset class="fieldset">
          <div class="tooltip tooltip-top" data-tip={L.bonjour_enabled_description()}>
            <label class="label cursor-pointer justify-start gap-2">
              <input bind:checked={bonjourEnabled} class="checkbox" type="checkbox" id="bonjour_enabled" />
              {L.bonjour_enabled()}
            </label>
          </div>
        </fieldset>
        <fieldset class="fieldset">
          <legend class="fieldset-legend">{L.bonjour_server_url()}</legend>
          <input bind:value={bonjourServerUrl} class="input w-full" type="url" id="bonjour_server_url" />
        </fieldset>
        <div class="tooltip tooltip-top" data-tip={L.debug_logs_description()}>
          <fieldset class="fieldset">
            <label class="label cursor-pointer justify-start gap-2">
              <input bind:checked={debugLogsEnabled} class="checkbox" type="checkbox" id="debug_logs" />
              {L.debug_logs()}
            </label>
          </fieldset>
        </div>
        <fieldset class="fieldset">
          <div class="tooltip tooltip-top" data-tip={L.e2ee_enabled_description()}>
            <label class="label cursor-pointer justify-start gap-2">
              <input bind:checked={e2eeEnabled} class="checkbox" type="checkbox" id="e2ee_enabled" />
              {L.e2ee_enabled()}
            </label>
          </div>
        </fieldset>
        <fieldset class="fieldset">
          <div class="tooltip tooltip-top" data-tip={L.media_e2ee_description()}>
            <label class="label cursor-pointer justify-start gap-2">
              <input
                bind:checked={mediaE2eeEnabled}
                class="checkbox"
                type="checkbox"
                id="media_e2ee"
                disabled={e2eeEnabled}
              />
              {L.media_e2ee()}
            </label>
          </div>
        </fieldset>
        <fieldset class="fieldset">
          <legend class="fieldset-legend">{L.stun_turn_server_objects()}</legend>
          <textarea
            bind:value={iceServersValue}
            class="textarea w-full {isIceServersValid ? 'textarea-success' : 'textarea-error'}"
            id="ice_servers"
            placeholder={'{ "urls": "stun:stun.l.google.com:19302" }'}
          ></textarea>
        </fieldset>
      </div>
    </div>
    <button class="btn btn-primary w-fit">{L.save()}</button>
  </form>
</div>

<style>
  :global(.color-preview) {
    color: var(--color, #ffffff);
  }
</style>
