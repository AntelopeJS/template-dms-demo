import type { Component } from 'vue'

interface EmailModule {
	default: Component
}

export const serverEmailTemplates = import.meta.glob<EmailModule>(
	'./app/emails/*.vue',
)
