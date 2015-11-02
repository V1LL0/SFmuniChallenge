//SF muni Challenge
//@author: Valerio Cestarelli

var sfMap = d3.select('#sfMap');

// Read the width from the element (so to avoid problems with the right panel)
// and the height from the screen object
var width = sfMap.node().clientWidth,
    height = screen.height;

// Create the SVG
var svg = sfMap
	      .append('svg')
          .attr('width', width)
          .attr('height', height);

var timeUpdate = 15000; // 15 sec

var filesPath = './sfmaps/';
var files = [filesPath+'neighborhoods.json', filesPath+'streets.json', filesPath+'arteries.json', filesPath+'freeways.json'];


var projection;
var path;

//In case of a filtering, later
var layers = [];


function computeProjection(fileJson, callback){

	d3.json(fileJson, function(geoJSON){

		var center = d3.geo.centroid(geoJSON);
		var scale  = 150;
		var offset = [width/2, height/2];
		projection = d3.geo.mercator().scale(scale).center(center)
		    .translate(offset);

		// create the path
		path = d3.geo.path().projection(projection);

		// using the path determine the bounds of the current map and use 
		// these to determine better values for the scale and translation
		var bounds  = path.bounds(geoJSON);

		// Bad practice... OK for now but it's to change...
		var heightScaleFactor = 1.7;
		var hscale  = scale*width  / ((bounds[1][0] - bounds[0][0])*heightScaleFactor);
		var vscale  = scale*height / (bounds[1][1] - bounds[0][1]);
		scale   = (hscale < vscale) ? hscale : vscale;
		offset  = [width - (bounds[0][0] + bounds[1][0])/2,
		             height - (bounds[0][1] + bounds[1][1])/2];

		// new projection
		projection = d3.geo.mercator().center(center)
			.scale(scale).translate(offset);
		
		// new path
		path = path.projection(projection);

		callback();

  });
}


// First of all, we have to load the map...

/************************************************/
/*           Load Json file into map            */
/************************************************/
function loadMapElements(json, nextJsonToLoad) {
	var jsonNameSplitted = json.split(/\.|\//);
	var type = jsonNameSplitted[jsonNameSplitted.length-2];
	console.log("type: ", type);

	d3.json(json, function(d) {

			svg
			.append('g').attr('id', type)
			.selectAll("path")
	    	.data(d.features)
       		.enter()
       		.append("path")
       		.attr("d", path)
       		.attr("class", "mapLayer");

       		layers.push(type);

		// mapElements = mapElements.concat(d.features);

		// This is going to call the next json file to load, after that the one before is loaded succesfully
		if(nextJsonToLoad < files.length){	
		    loadMapElements(files[nextJsonToLoad], nextJsonToLoad+1);
		}
	});


}

computeProjection(filesPath+'streets.json', function(){
	// Then, we have to call this function on the json files
	loadMapElements(files[0], 1);
});
