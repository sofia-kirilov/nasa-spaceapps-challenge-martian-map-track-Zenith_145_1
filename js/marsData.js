/* NASA-informed context; coordinates and polygons below are illustrative local geometry. */
window.MarsData = {
  origin: {lat:18.4447, lon:77.4508}, metersPerUnit:4,
  home:{x:715,y:480,name:'Habitat Ares',type:'habitat'},
  layers:[{id:'optical',name:'Orbital imagery',sub:'HiRISE / Mars Trek reference',color:'#c8baa0',opacity:100},{id:'slope',name:'Slope & elevation',sub:'Mobility exclusion >15° · model',color:'#ef8b73',opacity:65},{id:'geology',name:'Geology & mineralogy',sub:'USGS / CRISM context · schematic',color:'#a8bca0',opacity:40},{id:'thermal',name:'Thermal & exposure',sub:'THEMIS / RAD context · model',color:'#d2ad61',opacity:35}],
  zones:[
    {layer:'slope',name:'Delta scarp',slope:23,points:[[210,140],[340,195],[320,270],[410,315],[365,390],[450,425],[400,480],[340,420],[285,330],[250,240]]},
    {layer:'slope',name:'Crater ledge',slope:19,points:[[790,210],[890,180],[945,255],[895,330],[835,290]]},
    {layer:'geology',name:'Clay-bearing delta deposits',points:[[40,90],[220,100],[300,200],[250,300],[340,415],[235,490],[50,390]]},
    {layer:'geology',name:'Carbonate-bearing margin analogue',points:[[100,470],[300,450],[410,550],[350,710],[150,690]]},
    {layer:'thermal',name:'Exposed sandy terrain',radiation:0.045,soft:true,points:[[520,150],[720,100],[800,240],[745,380],[555,345],[485,250]]},
    {layer:'thermal',name:'Rocky shelter analogue',radiation:0.018,points:[[410,530],[520,480],[610,550],[560,670],[430,650]]}
  ],
  targets:[
    {id:'01',name:'Delta front',unit:'LAYERED SEDIMENTS',x:300,y:390,sol:1284,stop:25,color:'#aebea3',notes:'Jezero’s western delta preserves sediment deposited where an ancient river entered a lake. Layering can record changes in flow and lake history.',objective:'Document bedding contacts; collect a fine-grained sediment analogue sample.',instrument:'Mastcam-Z / SuperCam context',image:'https://science.nasa.gov/blog/studying-the-jezero-delta-from-a-distance/'},
    {id:'02',name:'Kodiak overlook',unit:'DELTA REMNANT',x:455,y:490,sol:1284,stop:20,color:'#d7b77c',notes:'Kodiak is an isolated remnant of the ancient delta. Rover imaging of its layers helped constrain the lake’s history. This marker is a schematic overlook, not its surveyed location.',objective:'Acquire a stereo panorama and compare layer orientations.',instrument:'Mastcam-Z context'},
    {id:'03',name:'Séítah outcrop',unit:'OLIVINE-RICH ROCK',x:690,y:270,sol:1284,stop:30,color:'#b1c0aa',notes:'Perseverance investigated olivine-rich igneous rocks in Séítah. Sand between outcrops complicates access; mineral alteration provides clues to past water.',objective:'Photograph grain texture and inspect an abrasion analogue.',instrument:'PIXL / SHERLOC context'},
    {id:'04',name:'Margin unit',unit:'CARBONATE CONTEXT',x:255,y:580,sol:1284,stop:25,color:'#9eada0',notes:'Orbital spectroscopy identified carbonate-bearing materials in Jezero’s margin region. Carbonates can preserve information about water–rock interaction; their origin requires ground truth.',objective:'Compare spectral signatures across the contact.',instrument:'CRISM / SuperCam context'},
    {id:'05',name:'Máaz basalt',unit:'CRATER FLOOR',x:825,y:560,sol:1284,stop:15,color:'#b5a18b',notes:'The crater-floor Máaz formation contains igneous rocks studied by Perseverance. Returned samples could help establish the timing of Jezero’s geologic events.',objective:'Survey basalt texture and log a reference sample.',instrument:'Perseverance crater-floor context'}
  ]
};
