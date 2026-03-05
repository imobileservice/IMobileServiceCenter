
console.log('Starting test...');
try {
    const { filtersService } = require('../lib/supabase/services/filters');
    console.log('Successfully imported filtersService');
    console.log('Service methods:', Object.keys(filtersService));
} catch (error) {
    console.error('Failed to import filtersService:', error);
}
console.log('Test complete.');
