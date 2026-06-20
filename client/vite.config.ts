import adapter from '@sveltejs/adapter-auto';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter()
		})
	],
	resolve: {
		alias: {
			// ✅ ชี้ไปที่ compiled JS (dist/) แทน .ts source โดยตรง
			// เพราะ esbuild ไม่รองรับ emitDecoratorMetadata ที่ @colyseus/schema ต้องการ
			'shared': path.resolve(__dirname, '../shared/dist/index.js')
		}
	},
	ssr: {
		// ✅ ลบ noExternal: ['shared'] ออก — dist/index.js เป็น ESM ปกติ ไม่ต้อง inline
		// ยัง externalize colyseus เพื่อให้ Node ใช้ resolution ของตัวเอง
		external: ['colyseus.js', '@colyseus/schema']
	},
	optimizeDeps: {
		exclude: ['shared']
	},
	esbuild: {
		target: 'esnext'
	}
});
