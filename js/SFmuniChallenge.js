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

var routes;

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
		
		if(callback){
			callback();	
		}
  });
}


// First of all, we have to load the map...

/************************************************/
/*           Load Json files into map           */
/************************************************/
function loadMapElements(json, nextJsonToLoad, callback) {
	var jsonNameSplitted = json.split(/\.|\//);
	var type = jsonNameSplitted[jsonNameSplitted.length-2];

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
		    loadMapElements(files[nextJsonToLoad], nextJsonToLoad+1, callback);
		}else{
			if(callback){
				callback();
			}
		}
	});
}

computeProjection(filesPath+'streets.json', function(){
	// Then, we have to call this function on the json files
	loadMapElements(files[0], 1, loadNextbusInformation);
});

//Now, we call nextbus API to retrieve the information about the buses
/************************************************/
/*           Load buses information             */
/************************************************/
function loadNextbusInformation(){
	obtainRoutes(obtainPaths);
}

function obtainRoutes(callback){

	//I don't know why, but if I don't put this no-sense parameter in the query it return a cross-origin-policy error
	var toAvoidCrossOriginProblem = "&r=";

	// sf-muni is the agency tag that nextbus uses to denote an agency, in this case we need sf-muni
	var query = "http://webservices.nextbus.com/service/publicXMLFeed?command=routeList&a=sf-muni"+toAvoidCrossOriginProblem;
	routes = [];
	
	d3.xml(query, function(error, data) {
		d3.select(data)
		  	.selectAll('route')
    		.each(function(){
		      var route = d3.select(this);
		      
		      routes.push({
		          tag: route.attr('tag'),
		          title: route.attr('title')
		        });
	    	});

    		if(callback){
				callback();
			}

	});

}



function obtainPaths(){
	obtainPathPerRoute(routes[0], 1);
}

//We could obtain the information for every route at once but it could be too slow.
//So I decided to obtain a route per time so to load them one by one and show them to the user.

var routesColor = {};
var routesPath = [];
var paths = [];

function obtainPathPerRoute(route, next){
	var query = "http://webservices.nextbus.com/service/publicXMLFeed?command=routeConfig&a=sf-muni&r="+route.tag;

	d3.xml(query, function(error, data) {
			d3.select(data)
			   .selectAll('route')
			   .each(function(){
				    var route = d3.select(this);
				    var tag   = route.attr('tag');
				    
				    // route color
					routesColor[tag] = route.attr('color');

				    //routeLookup[id].color = routeColor;

				    // format the paths in something d3 can understand
				    route
				    	.selectAll('path')
				        .each(function(){
				        	var feature = [];
				          
				        	d3.select(this).selectAll('point').each(function(){
				            	var point = d3.select(this);
				            	feature.push([ + point.attr('lon'), + point.attr('lat'), 0]);
				          	});
				        	routesPath.push({type: 'Feature', id: tag, geometry: {type: 'LineString', coordinates: feature }});
				        });

			      // paths.push({id: tag, color: routesColor[tag], paths: routesPath});
			      // now get all the paths for the given route

			      svg.selectAll('g paths')
					 .data(routesPath)
					 .enter()
					 .append('path')
					 .attr('d', path)
					 .style('stroke', function (d){ return '#'+routesColor[d.id]; })
					 .style('fill', 'none');


				});
			    
			   	console.log(parseInt(next/routes.length*100)+"%");
				if(next >= routes.length){
						 var pathLines = paths.map(function (route){
						    return route.paths;
						  }).reduce(function (features, paths){

						    return features.concat(paths);

						  }, []);

				}else{
					obtainPathPerRoute(routes[next], next+1, callback);
				}
		});

}

