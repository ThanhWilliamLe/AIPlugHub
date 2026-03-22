import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useToolStore } from '../stores/tool-store';
import type { Component, ComponentId, ToolDetectionResult, NativePlugin } from '@shared/types';

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function makeId(overrides: Partial<ComponentId> = {}): ComponentId {
  return {
    tool: 'claude-code',
    type: 'mcp-server',
    name: 'test-server',
    scope: 'user',
    ...overrides,
  };
}

function makeComponent(overrides: Partial<Component> = {}): Component {
  return {
    id: makeId(),
    enabled: true,
    tracking: 'detected',
    core: { transport: 'stdio', command: 'npx test-server' },
    ...overrides,
  };
}

function makeToolResult(overrides: Partial<ToolDetectionResult> = {}): ToolDetectionResult {
  return {
    tool: 'claude-code',
    detected: true,
    configPaths: [],
    ...overrides,
  };
}

function makePlugin(overrides: Partial<NativePlugin> = {}): NativePlugin {
  return {
    pluginKey: 'my-plugin@marketplace',
    pluginName: 'my-plugin',
    marketplace: 'marketplace',
    version: '1.0.0',
    enabled: true,
    scope: 'user',
    componentCount: 2,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Reset state between tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  useToolStore.setState({
    tools: [],
    components: [],
    plugins: [],
    loading: false,
    scanning: false,
    error: null,
  });
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// detectTools
// ---------------------------------------------------------------------------

describe('detectTools', () => {
  it('sets loading true at start, false on success', async () => {
    let loadingDuringCall = false;
    vi.mocked(window.aiplughub.tools.detect).mockImplementationOnce(async () => {
      loadingDuringCall = useToolStore.getState().loading;
      return [];
    });

    await useToolStore.getState().detectTools();

    expect(loadingDuringCall).toBe(true);
    expect(useToolStore.getState().loading).toBe(false);
  });

  it('clears error at start', async () => {
    useToolStore.setState({ error: 'stale error' });
    vi.mocked(window.aiplughub.tools.detect).mockResolvedValueOnce([]);

    await useToolStore.getState().detectTools();

    expect(useToolStore.getState().error).toBeNull();
  });

  it('sets tools on success', async () => {
    const tools = [makeToolResult(), makeToolResult({ tool: 'claude-desktop' })];
    vi.mocked(window.aiplughub.tools.detect).mockResolvedValueOnce(tools);

    await useToolStore.getState().detectTools();

    expect(useToolStore.getState().tools).toEqual(tools);
  });

  it('leaves tools empty when API returns empty array', async () => {
    vi.mocked(window.aiplughub.tools.detect).mockResolvedValueOnce([]);

    await useToolStore.getState().detectTools();

    expect(useToolStore.getState().tools).toEqual([]);
  });

  it('sets error and loading false on failure', async () => {
    vi.mocked(window.aiplughub.tools.detect).mockRejectedValueOnce(new Error('network error'));

    await useToolStore.getState().detectTools();

    expect(useToolStore.getState().error).toBe('network error');
    expect(useToolStore.getState().loading).toBe(false);
  });

  it('does not update tools on failure', async () => {
    const existingTools = [makeToolResult()];
    useToolStore.setState({ tools: existingTools });
    vi.mocked(window.aiplughub.tools.detect).mockRejectedValueOnce(new Error('fail'));

    await useToolStore.getState().detectTools();

    expect(useToolStore.getState().tools).toEqual(existingTools);
  });
});

// ---------------------------------------------------------------------------
// scanAll
// ---------------------------------------------------------------------------

describe('scanAll', () => {
  it('sets scanning true at start, false on success', async () => {
    let scanningDuringCall = false;
    vi.mocked(window.aiplughub.tools.scanAll).mockImplementationOnce(async () => {
      scanningDuringCall = useToolStore.getState().scanning;
      return [];
    });

    await useToolStore.getState().scanAll();

    expect(scanningDuringCall).toBe(true);
    expect(useToolStore.getState().scanning).toBe(false);
  });

  it('clears error at start', async () => {
    useToolStore.setState({ error: 'old error' });
    vi.mocked(window.aiplughub.tools.scanAll).mockResolvedValueOnce([]);

    await useToolStore.getState().scanAll();

    expect(useToolStore.getState().error).toBeNull();
  });

  it('sets components on success', async () => {
    const components = [
      makeComponent({ id: makeId({ name: 'server-a' }) }),
      makeComponent({ id: makeId({ name: 'server-b' }) }),
    ];
    vi.mocked(window.aiplughub.tools.scanAll).mockResolvedValueOnce(components);

    await useToolStore.getState().scanAll();

    expect(useToolStore.getState().components).toEqual(components);
  });

  it('replaces existing components on success', async () => {
    useToolStore.setState({ components: [makeComponent()] });
    const fresh = [makeComponent({ id: makeId({ name: 'fresh-server' }) })];
    vi.mocked(window.aiplughub.tools.scanAll).mockResolvedValueOnce(fresh);

    await useToolStore.getState().scanAll();

    expect(useToolStore.getState().components).toEqual(fresh);
  });

  it('sets error and scanning false on failure', async () => {
    vi.mocked(window.aiplughub.tools.scanAll).mockRejectedValueOnce(new Error('scan failed'));

    await useToolStore.getState().scanAll();

    expect(useToolStore.getState().error).toBe('scan failed');
    expect(useToolStore.getState().scanning).toBe(false);
  });

  it('does not change components on failure', async () => {
    const existing = [makeComponent()];
    useToolStore.setState({ components: existing });
    vi.mocked(window.aiplughub.tools.scanAll).mockRejectedValueOnce(new Error('fail'));

    await useToolStore.getState().scanAll();

    expect(useToolStore.getState().components).toEqual(existing);
  });
});

// ---------------------------------------------------------------------------
// toggleComponent
// ---------------------------------------------------------------------------

describe('toggleComponent', () => {
  it('optimistically disables an enabled component before IPC resolves', async () => {
    const component = makeComponent({ enabled: true });
    useToolStore.setState({ components: [component] });

    // Capture what the store state looks like at the moment disable is called
    let enabledAtIpcTime: boolean | undefined = undefined;
    vi.mocked(window.aiplughub.components.disable).mockImplementationOnce(async () => {
      enabledAtIpcTime = useToolStore.getState().components[0].enabled;
    });

    await useToolStore.getState().toggleComponent(component.id);

    // The optimistic flip happened before IPC: enabled was false while disable ran
    expect(enabledAtIpcTime).toBe(false);
    // And the final state reflects the toggle
    expect(useToolStore.getState().components[0].enabled).toBe(false);
  });

  it('optimistically enables a disabled component', async () => {
    const component = makeComponent({ enabled: false });
    useToolStore.setState({ components: [component] });
    vi.mocked(window.aiplughub.components.enable).mockResolvedValueOnce(undefined);

    await useToolStore.getState().toggleComponent(component.id);

    expect(useToolStore.getState().components[0].enabled).toBe(true);
  });

  it('calls disable when component is enabled', async () => {
    const component = makeComponent({ enabled: true });
    useToolStore.setState({ components: [component] });
    vi.mocked(window.aiplughub.components.disable).mockResolvedValueOnce(undefined);

    await useToolStore.getState().toggleComponent(component.id);

    expect(window.aiplughub.components.disable).toHaveBeenCalledWith(component.id);
    expect(window.aiplughub.components.enable).not.toHaveBeenCalled();
  });

  it('calls enable when component is disabled', async () => {
    const component = makeComponent({ enabled: false });
    useToolStore.setState({ components: [component] });
    vi.mocked(window.aiplughub.components.enable).mockResolvedValueOnce(undefined);

    await useToolStore.getState().toggleComponent(component.id);

    expect(window.aiplughub.components.enable).toHaveBeenCalledWith(component.id);
    expect(window.aiplughub.components.disable).not.toHaveBeenCalled();
  });

  it('rolls back to original state on IPC failure', async () => {
    const component = makeComponent({ enabled: true });
    useToolStore.setState({ components: [component] });
    vi.mocked(window.aiplughub.components.disable).mockRejectedValueOnce(new Error('IPC error'));

    await useToolStore.getState().toggleComponent(component.id);

    expect(useToolStore.getState().components[0].enabled).toBe(true);
  });

  it('sets error on IPC failure', async () => {
    const component = makeComponent({ enabled: true });
    useToolStore.setState({ components: [component] });
    vi.mocked(window.aiplughub.components.disable).mockRejectedValueOnce(new Error('IPC error'));

    await useToolStore.getState().toggleComponent(component.id);

    expect(useToolStore.getState().error).toBe('IPC error');
  });

  it('does nothing when component id is not found', async () => {
    const component = makeComponent({ id: makeId({ name: 'server-a' }) });
    useToolStore.setState({ components: [component] });

    await useToolStore.getState().toggleComponent(makeId({ name: 'nonexistent' }));

    expect(window.aiplughub.components.enable).not.toHaveBeenCalled();
    expect(window.aiplughub.components.disable).not.toHaveBeenCalled();
    expect(useToolStore.getState().components[0].enabled).toBe(true);
  });

  it('does nothing when component enabled is undefined', async () => {
    const component = makeComponent({ enabled: undefined });
    useToolStore.setState({ components: [component] });

    await useToolStore.getState().toggleComponent(component.id);

    expect(window.aiplughub.components.enable).not.toHaveBeenCalled();
    expect(window.aiplughub.components.disable).not.toHaveBeenCalled();
  });

  it('only toggles the matched component, leaves others unchanged', async () => {
    const compA = makeComponent({ id: makeId({ name: 'server-a' }), enabled: true });
    const compB = makeComponent({ id: makeId({ name: 'server-b' }), enabled: true });
    useToolStore.setState({ components: [compA, compB] });
    vi.mocked(window.aiplughub.components.disable).mockResolvedValueOnce(undefined);

    await useToolStore.getState().toggleComponent(compA.id);

    const state = useToolStore.getState();
    expect(state.components.find((c) => c.id.name === 'server-a')?.enabled).toBe(false);
    expect(state.components.find((c) => c.id.name === 'server-b')?.enabled).toBe(true);
  });

  it('rolls back only the matched component, preserving others on failure', async () => {
    const compA = makeComponent({ id: makeId({ name: 'server-a' }), enabled: true });
    const compB = makeComponent({ id: makeId({ name: 'server-b' }), enabled: false });
    useToolStore.setState({ components: [compA, compB] });
    vi.mocked(window.aiplughub.components.disable).mockRejectedValueOnce(new Error('fail'));

    await useToolStore.getState().toggleComponent(compA.id);

    const state = useToolStore.getState();
    // compA rolls back to original enabled=true
    expect(state.components.find((c) => c.id.name === 'server-a')?.enabled).toBe(true);
    // compB is untouched
    expect(state.components.find((c) => c.id.name === 'server-b')?.enabled).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// uninstallComponent
// ---------------------------------------------------------------------------

describe('uninstallComponent', () => {
  it('removes the component from array on success', async () => {
    const compA = makeComponent({ id: makeId({ name: 'server-a' }) });
    const compB = makeComponent({ id: makeId({ name: 'server-b' }) });
    useToolStore.setState({ components: [compA, compB] });
    vi.mocked(window.aiplughub.components.uninstall).mockResolvedValueOnce(undefined);

    await useToolStore.getState().uninstallComponent(compA.id);

    const components = useToolStore.getState().components;
    expect(components).toHaveLength(1);
    expect(components[0].id.name).toBe('server-b');
  });

  it('calls uninstall with the correct id', async () => {
    const component = makeComponent();
    useToolStore.setState({ components: [component] });
    vi.mocked(window.aiplughub.components.uninstall).mockResolvedValueOnce(undefined);

    await useToolStore.getState().uninstallComponent(component.id);

    expect(window.aiplughub.components.uninstall).toHaveBeenCalledWith(component.id);
  });

  it('sets error and keeps component in array on failure', async () => {
    const component = makeComponent();
    useToolStore.setState({ components: [component] });
    vi.mocked(window.aiplughub.components.uninstall).mockRejectedValueOnce(
      new Error('uninstall failed'),
    );

    await useToolStore.getState().uninstallComponent(component.id);

    expect(useToolStore.getState().error).toBe('uninstall failed');
    expect(useToolStore.getState().components).toHaveLength(1);
  });

  it('does not change other components on failure', async () => {
    const compA = makeComponent({ id: makeId({ name: 'server-a' }) });
    const compB = makeComponent({ id: makeId({ name: 'server-b' }) });
    useToolStore.setState({ components: [compA, compB] });
    vi.mocked(window.aiplughub.components.uninstall).mockRejectedValueOnce(new Error('fail'));

    await useToolStore.getState().uninstallComponent(compA.id);

    expect(useToolStore.getState().components).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// setComponents
// ---------------------------------------------------------------------------

describe('setComponents', () => {
  it('replaces all components', () => {
    useToolStore.setState({ components: [makeComponent()] });
    const newComponents = [
      makeComponent({ id: makeId({ name: 'alpha' }) }),
      makeComponent({ id: makeId({ name: 'beta' }) }),
    ];

    useToolStore.getState().setComponents(newComponents);

    expect(useToolStore.getState().components).toEqual(newComponents);
  });

  it('accepts empty array', () => {
    useToolStore.setState({ components: [makeComponent()] });

    useToolStore.getState().setComponents([]);

    expect(useToolStore.getState().components).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// setTools
// ---------------------------------------------------------------------------

describe('setTools', () => {
  it('replaces all tools', () => {
    const tools = [makeToolResult(), makeToolResult({ tool: 'claude-desktop' })];

    useToolStore.getState().setTools(tools);

    expect(useToolStore.getState().tools).toEqual(tools);
  });

  it('accepts empty array', () => {
    useToolStore.setState({ tools: [makeToolResult()] });

    useToolStore.getState().setTools([]);

    expect(useToolStore.getState().tools).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// clearError
// ---------------------------------------------------------------------------

describe('clearError', () => {
  it('sets error to null', () => {
    useToolStore.setState({ error: 'some error' });

    useToolStore.getState().clearError();

    expect(useToolStore.getState().error).toBeNull();
  });

  it('is a no-op when error is already null', () => {
    useToolStore.getState().clearError();

    expect(useToolStore.getState().error).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// loadPlugins
// ---------------------------------------------------------------------------

describe('loadPlugins', () => {
  it('sets plugins on success', async () => {
    const plugins = [makePlugin(), makePlugin({ pluginKey: 'other@mkt' })];
    vi.mocked(window.aiplughub.plugins.list).mockResolvedValueOnce(plugins);

    await useToolStore.getState().loadPlugins();

    expect(useToolStore.getState().plugins).toEqual(plugins);
  });

  it('sets error on failure', async () => {
    vi.mocked(window.aiplughub.plugins.list).mockRejectedValueOnce(new Error('load failed'));

    await useToolStore.getState().loadPlugins();

    expect(useToolStore.getState().error).toBe('load failed');
  });

  it('does not change plugins on failure', async () => {
    const existing = [makePlugin()];
    useToolStore.setState({ plugins: existing });
    vi.mocked(window.aiplughub.plugins.list).mockRejectedValueOnce(new Error('fail'));

    await useToolStore.getState().loadPlugins();

    expect(useToolStore.getState().plugins).toEqual(existing);
  });
});

// ---------------------------------------------------------------------------
// togglePlugin
// ---------------------------------------------------------------------------

describe('togglePlugin', () => {
  it('optimistically disables an enabled plugin', async () => {
    const plugin = makePlugin({ enabled: true });
    useToolStore.setState({ plugins: [plugin] });

    let enabledDuringIpc: boolean | undefined;
    vi.mocked(window.aiplughub.plugins.toggle).mockImplementationOnce(async () => {
      enabledDuringIpc = useToolStore.getState().plugins[0].enabled;
    });

    await useToolStore.getState().togglePlugin(plugin.pluginKey);

    expect(enabledDuringIpc).toBe(false);
    expect(useToolStore.getState().plugins[0].enabled).toBe(false);
  });

  it('optimistically enables a disabled plugin', async () => {
    const plugin = makePlugin({ enabled: false });
    useToolStore.setState({ plugins: [plugin] });
    vi.mocked(window.aiplughub.plugins.toggle).mockResolvedValueOnce(undefined);

    await useToolStore.getState().togglePlugin(plugin.pluginKey);

    expect(useToolStore.getState().plugins[0].enabled).toBe(true);
  });

  it('calls toggle with correct args', async () => {
    const plugin = makePlugin({ enabled: true });
    useToolStore.setState({ plugins: [plugin] });
    vi.mocked(window.aiplughub.plugins.toggle).mockResolvedValueOnce(undefined);

    await useToolStore.getState().togglePlugin(plugin.pluginKey);

    expect(window.aiplughub.plugins.toggle).toHaveBeenCalledWith(plugin.pluginKey, false);
  });

  it('rolls back on failure', async () => {
    const plugin = makePlugin({ enabled: true });
    useToolStore.setState({ plugins: [plugin] });
    vi.mocked(window.aiplughub.plugins.toggle).mockRejectedValueOnce(new Error('toggle failed'));

    await useToolStore.getState().togglePlugin(plugin.pluginKey);

    expect(useToolStore.getState().plugins[0].enabled).toBe(true);
    expect(useToolStore.getState().error).toBe('toggle failed');
  });

  it('does nothing when plugin key is not found', async () => {
    useToolStore.setState({ plugins: [makePlugin()] });

    await useToolStore.getState().togglePlugin('nonexistent@mkt');

    expect(window.aiplughub.plugins.toggle).not.toHaveBeenCalled();
  });

  it('only toggles the matched plugin, leaves others unchanged', async () => {
    const pluginA = makePlugin({ pluginKey: 'a@mkt', enabled: true });
    const pluginB = makePlugin({ pluginKey: 'b@mkt', enabled: false });
    useToolStore.setState({ plugins: [pluginA, pluginB] });
    vi.mocked(window.aiplughub.plugins.toggle).mockResolvedValueOnce(undefined);

    await useToolStore.getState().togglePlugin('a@mkt');

    const state = useToolStore.getState();
    expect(state.plugins.find((p) => p.pluginKey === 'a@mkt')?.enabled).toBe(false);
    expect(state.plugins.find((p) => p.pluginKey === 'b@mkt')?.enabled).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// uninstallPlugin
// ---------------------------------------------------------------------------

describe('uninstallPlugin', () => {
  it('removes the plugin from array on success', async () => {
    const pluginA = makePlugin({ pluginKey: 'a@mkt' });
    const pluginB = makePlugin({ pluginKey: 'b@mkt' });
    useToolStore.setState({ plugins: [pluginA, pluginB] });
    vi.mocked(window.aiplughub.plugins.uninstall).mockResolvedValueOnce(undefined);

    await useToolStore.getState().uninstallPlugin('a@mkt');

    const plugins = useToolStore.getState().plugins;
    expect(plugins).toHaveLength(1);
    expect(plugins[0].pluginKey).toBe('b@mkt');
  });

  it('removes components with matching pluginKey extension', async () => {
    const comp1 = makeComponent({
      id: makeId({ name: 'plugin-comp', scope: 'plugin' }),
      extensions: { pluginKey: 'a@mkt' },
    });
    const comp2 = makeComponent({ id: makeId({ name: 'standalone' }) });
    useToolStore.setState({
      plugins: [makePlugin({ pluginKey: 'a@mkt' })],
      components: [comp1, comp2],
    });
    vi.mocked(window.aiplughub.plugins.uninstall).mockResolvedValueOnce(undefined);

    await useToolStore.getState().uninstallPlugin('a@mkt');

    const components = useToolStore.getState().components;
    expect(components).toHaveLength(1);
    expect(components[0].id.name).toBe('standalone');
  });

  it('calls uninstall with correct key', async () => {
    useToolStore.setState({ plugins: [makePlugin({ pluginKey: 'a@mkt' })] });
    vi.mocked(window.aiplughub.plugins.uninstall).mockResolvedValueOnce(undefined);

    await useToolStore.getState().uninstallPlugin('a@mkt');

    expect(window.aiplughub.plugins.uninstall).toHaveBeenCalledWith('a@mkt');
  });

  it('sets error and keeps plugin on failure', async () => {
    useToolStore.setState({ plugins: [makePlugin({ pluginKey: 'a@mkt' })] });
    vi.mocked(window.aiplughub.plugins.uninstall).mockRejectedValueOnce(
      new Error('uninstall failed'),
    );

    await useToolStore.getState().uninstallPlugin('a@mkt');

    expect(useToolStore.getState().error).toBe('uninstall failed');
    expect(useToolStore.getState().plugins).toHaveLength(1);
  });
});
