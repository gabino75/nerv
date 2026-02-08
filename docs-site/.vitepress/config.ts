import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'NERV',
  description: 'AI-Orchestrated Multi-Repository Development',
  base: '/nerv/',

  head: [
    ['link', { rel: 'icon', type: 'image/png', href: '/nerv/nerv-logo.png' }]
  ],

  themeConfig: {
    logo: '/nerv-logo.png',

    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'Features', link: '/features/multi-tab' },
      { text: 'CLI', link: '/cli/' },
      { text: 'Architecture', link: '/architecture/' },
      { text: 'Benchmarking', link: '/benchmarking/overview' },
      { text: 'Demos', link: '/demos' },
      { text: 'Contributing', link: '/contributing' },
      {
        text: 'v1.0.0',
        items: [
          { text: 'Changelog', link: '/changelog' },
          { text: 'GitHub', link: 'https://github.com/gabino75/nerv' }
        ]
      }
    ],

    sidebar: {
      '/guide/': [
        {
          text: 'Getting Started',
          items: [
            { text: 'Introduction', link: '/guide/getting-started' },
            { text: 'Installation', link: '/guide/installation' },
            { text: 'Quick Start', link: '/guide/quick-start' },
            { text: 'Core Concepts', link: '/guide/concepts' }
          ]
        }
      ],
      '/features/': [
        {
          text: 'Features',
          items: [
            { text: 'Multi-Tab Sessions', link: '/features/multi-tab' },
            { text: 'YOLO Mode', link: '/features/yolo-mode' },
            { text: 'Permission System', link: '/features/permissions' },
            { text: 'Custom Agents', link: '/features/custom-agents' },
            { text: 'Benchmarking', link: '/features/benchmarking' }
          ]
        }
      ],
      '/cli/': [
        {
          text: 'CLI Reference',
          items: [
            { text: 'Overview', link: '/cli/' },
            { text: 'Project Commands', link: '/cli/project' },
            { text: 'Task Commands', link: '/cli/task' },
            { text: 'Session Commands', link: '/cli/session' },
            { text: 'Config Commands', link: '/cli/config' },
            { text: 'Benchmark Commands', link: '/cli/benchmark' }
          ]
        }
      ],
      '/benchmarking/': [
        {
          text: 'Benchmarking',
          items: [
            { text: 'Overview', link: '/benchmarking/overview' },
            { text: 'Running Benchmarks', link: '/benchmarking/running-benchmarks' },
            { text: 'Scoring System', link: '/benchmarking/scoring-system' },
            { text: 'Creating Specs', link: '/benchmarking/creating-specs' }
          ]
        }
      ],
      '/architecture/': [
        {
          text: 'Architecture',
          items: [
            { text: 'Overview', link: '/architecture/' },
            { text: 'Database', link: '/architecture/database' },
            { text: 'Claude Integration', link: '/architecture/claude-integration' },
            { text: 'Permission Hooks', link: '/architecture/hooks' }
          ]
        }
      ]
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/gabino75/nerv' }
    ],

    search: {
      provider: 'local'
    },

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright 2026-present'
    }
  }
})
