import TemplateGallery from '../components/TemplateGallery.vue'

const GALLERY_DISPLAY_ID = 'mailing:gallery'
const GALLERY_DISPLAY_ORDER = 5

export default defineDmsPlugin(() => {
	registerTableViewDisplay({
		id: GALLERY_DISPLAY_ID,
		label: 'dms_mailing.templates.display.gallery',
		icon: 'i-ph-squares-four',
		order: GALLERY_DISPLAY_ORDER,
		component: TemplateGallery,
	})
})
