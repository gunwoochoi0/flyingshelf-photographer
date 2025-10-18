/**
 * Simple test to verify the rendering service works
 * 
 * Run with: node test/render-example.js
 */

const fs = require('fs');
const path = require('path');

// Import the rendering functions (will need to be built first with `npm run build`)
const { renderCanvasServerSide, canRenderServerSide } = require('../dist/index');

async function testRender() {
  console.log('🎨 Canvas Render Service - Test\n');

  // Load example data
  const example1 = require('../src/examples/data1.json');
  
  // Create version snapshot from example data
  const versionData = {
    id: 'test-version-1',
    parentId: null,
    name: 'Test Render',
    components: example1.components,
    timestamp: Date.now(),
    background: example1.background
  };

  console.log(`📊 Canvas: ${versionData.name}`);
  console.log(`📐 Dimensions: ${example1.dimensions.width}x${example1.dimensions.height}`);
  console.log(`🔢 Components: ${versionData.components.length}`);
  console.log('');

  // Check if all components can be rendered
  const canRender = canRenderServerSide(versionData.components);
  console.log(`✓ Can render server-side: ${canRender}`);
  
  if (!canRender) {
    const unsupported = versionData.components.filter(c => 
      c.type === 'video' || c.type.startsWith('placeholder-')
    );
    console.log(`⚠️  Unsupported components found:`, unsupported.map(c => c.type));
    return;
  }

  console.log('\n🚀 Rendering...');
  const startTime = Date.now();

  try {
    // Render the canvas
    const pngBuffer = await renderCanvasServerSide(
      versionData,
      example1.dimensions
    );

    const renderTime = Date.now() - startTime;
    console.log(`✅ Rendered in ${renderTime}ms`);
    console.log(`📦 Buffer size: ${(pngBuffer.length / 1024).toFixed(2)} KB`);

    // Save the output
    const outputPath = path.join(__dirname, 'output.png');
    fs.writeFileSync(outputPath, pngBuffer);
    console.log(`💾 Saved to: ${outputPath}`);
    
    console.log('\n✨ Success! Check test/output.png to see the result.');
  } catch (error) {
    console.error('\n❌ Render failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the test
testRender().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

