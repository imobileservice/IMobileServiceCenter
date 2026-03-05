
console.log('Starting admin import test...');
try {
    const { filtersService } = require('../../../lib/supabase/services/filters');
    console.log('Successfully imported filtersService from admin dir');
} catch (error) {
    console.error('Failed to import filtersService:', error);
    process.exit(1);
}
