import { defineConfig } from 'vitepress'
import { withMermaid } from 'vitepress-plugin-mermaid'

export default withMermaid(defineConfig({
  title: 'NERV',
  description: 'AI-Orchestrated Multi-Repository Development',
  base: '/nerv/',
  appearance: 'dark',

  head: [
    ['link', { rel: 'icon', type: 'image/png', href: '/nerv/nerv-logo.png' }]
  ],

  themeConfig: {
    logo: '/nerv-logo.png',

    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'Features', link: '/features/recommend' },
      { text: 'CLI', link: '/cli/' },
      { text: 'Architecture', link: '/architecture/' },
      { text: 'Benchmarking', link: '/benchmarking/overview' },
      { text: 'Demos', link: '/demos' },
      { text: 'Contributing', link: '/contributing/' },
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
            { text: 'Core Concepts', link: '/guide/concepts' }
          ]
        }
      ],
      '/features/': [
        {
          text: 'Features',
          items: [
            { text: "What's Next? (Recommend)", link: '/features/recommend' },
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
            { text: 'Architecture', link: '/benchmarking/architecture' },
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
      ],
      '/contributing/': [
        {
          text: 'Contributing',
          items: [
            { text: 'Overview', link: '/contributing/' },
            { text: 'Development Setup', link: '/contributing/development' },
            { text: 'Testing', link: '/contributing/testing' },
            { text: 'Releasing', link: '/contributing/releasing' }
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
  },

  mermaid: {
    theme: 'dark',
    themeVariables: {
      primaryColor: '#7B2D8E',
      primaryTextColor: '#e0e0e0',
      primaryBorderColor: '#9B4DBA',
      lineColor: '#4ADE80',
      secondaryColor: '#1a1a24',
      tertiaryColor: '#12121a',
      noteBkgColor: '#1a1a24',
      noteTextColor: '#e0e0e0',
    }
  },
}))
