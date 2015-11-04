//SF muni Challenge
//@author: Valerio Cestarelli
//
// Approach: lazy load
// At the beginning I am loading only the routes name, without information about buses.
// Then, the user can choose one or more lines and visualize the buses on the maps.
// Once that the information about a line is loaded, it remains in memory.
// So, in case a user load a line and then he/she hide it, it remains in memory for a possible future use.

// div of the map
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

var files = ['./sfmaps/neighborhoods.json', './sfmaps/streets.json', './sfmaps/arteries.json', './sfmaps/freeways.json'];

var projection;
var path;

/*
	variables for managing the routes and the vehicles
*/
var routesColor = {};
var routesPath = [];
var paths = [];

var vehiclesPerRoute = {};

// All the sf-muni routes, loaded at the application startup
var allRoutes = [];

// Only the loaded routes, hidden and selected
var hiddenRoutes = [];
var selectedRoutes = [];
// Only the loaded paths, they corresponds to the routes, but they contain the information about the paths.
var hiddenPaths = [];
var selectedPaths = [];


/*********************************************************/
/* Function for computing projection basing on a geoJson */
/*********************************************************/
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


/************************************/
/*           Load SF MAP            */
/************************************/
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

		// This is going to call the next json file to load, after that the one before is loaded succesfully
		if(nextJsonToLoad < files.length){
		    loadMapElements(files[nextJsonToLoad], nextJsonToLoad+1, callback);
		}else{
			// append two elements, one for the paths and one for the vehicles
			svg
			  .append('g')
			  .classed('paths', true);
			svg
			  .append('g')
			  .classed('vehicles', true);

			if(callback){
				callback();
			}
		}
	});
}

// Start with requesting all the routes and creating the buttons
function loadNextbusInformation(){
	obtainRoutes(createButtons);
}

function obtainRoutes(callback){
	// a is the 'agency tag', nextbus uses it to denote an agency, in this case we need sf-muni
	var query = "http://webservices.nextbus.com/service/publicXMLFeed?command=routeList&a=sf-muni&r=";
	
	d3.xml(query, function(error, data) {
		d3.select(data)
		  	.selectAll('route')
    		.each(function(){
		      var route = d3.select(this);
		      
		      allRoutes.push({
		          tag: route.attr('tag'),
		          title: route.attr('title')
		        });
	    	});

    		if(callback){
				callback();
			}

	});

}

function createButtons() {
	allRoutes.forEach(function (route){
        var newButton= $('<input type="button" value="'+route.tag+'" class="btn btn-default btnRoute"/>');
        newButton.on('click', function(){ 
        	if(newButton.hasClass("btn-default")){
        		newButton.removeClass("btn-default");
        		newButton.addClass("btn-warning");
        		addRouteAndUpdate(route);
        	}else{
        		newButton.removeClass("btn-warning");
        		newButton.addClass("btn-default");
        		removeRouteAndUpdate(route);
        	}
        });
		$("#busesButtons").append(newButton);
    });
}

// handy function for searching an object in an array through the value of a property
function arrayObjectIndexOf(myArray, property, searchTerm) {
    for(var i = 0; i < myArray.length; i++) {
        if (myArray[i][property] === searchTerm) return i;
    }
    return -1;
}


function addRouteAndUpdate(route){
	console.log("addRoute: ", route);
	var index = arrayObjectIndexOf(hiddenRoutes, 'tag', route.tag);
	console.log("Index: ", index);
	// if it is a new route, then load the info about it
	selectedRoutes.push(route);
	if(index === -1){
		//load the pathOfTheRoute
		console.log("obtainPaths...");
		obtainPaths(route, updateSvg);
	}else{
		// it is an already loaded route but hidden
		hiddenRoutes = hiddenRoutes.splice(index,1);
		moveHiddenPathsToSelected(route, updateSvg);
	}
}

function removeRouteAndUpdate(route){
	var index = arrayObjectIndexOf(selectedRoutes, 'tag', route.tag);
	selectedRoutes = selectedRoutes.splice(index,1);
	hiddenRoutes.push(route);
	moveSelectedPathsToHidden(route, updateSvg);
}


function moveHiddenPathsToSelected(route, callback){
	selectedPaths = selectedPaths.concat(
		hiddenPaths.filter(function(item){
			return item.properties.routeTag === route.tag;
		})
	);

	hiddenPaths = hiddenPaths.filter(function(item){
					return item.properties.routeTag !== route.tag;
				  });
	if(callback){
		callback();
	}

}

function moveSelectedPathsToHidden(route, callback){
	hiddenPaths = hiddenPaths.concat(
		selectedPaths.filter(function(item){
			return item.properties.routeTag === route.tag;
		})
	);

	selectedPaths = selectedPaths.filter(function(item){
					return item.properties.routeTag !== route.tag;
				  });
	
	if(callback){
		callback();
	}

}


////// Update svg with data stored inside the global variables.
////// updateSvg can be launched after that the arrays of vehicles and paths are updated.
function updateSvg(){
	drawPaths();
	drawBuses();
}	

// drawPaths has to do three steps:
//  1. update the coordinates of the paths that have new coords.
//  2. add new paths, if any
//  3. remove paths that are not on the maps anymore (or that are to hide because of a user request)
function drawPaths(){
	var pathsToDraw = [];
	console.log(selectedPaths);
	var pathsOnSvg = svg.select('g.paths')
						.selectAll('.routePath')
						.data(selectedPaths);


	console.log("pathsOnSvg:", pathsOnSvg.enter());
	
		pathsOnSvg
			   .enter()
			   .append('path')
			   .attr('class', 'routePath')
			   .attr('d', path)
			   .style('stroke', function (d){ return '#'+d.properties.color; })
			   .style('fill', 'none');

		pathsOnSvg
				.exit()
					.remove();

}

// drawBuses has to do three steps:
//  1. update the coordinates of the buses that have new coords.
//  2. add new vehicles, if any
//  3. remove vehicles that are not on the maps anymore (or that are to hide because of a user request)
function drawBuses(){
	selectedRoutes.forEach(function (route){
		if(vehiclesPerRoute[route.tag]){
			var busesOnSvg = svg.selectAll('.vehicle_'+route.tag)
								.data(vehiclesPerRoute[route.tag], function(d){return d.id});

			busesOnSvg
				.update()
				  	.transition()
				    .duration(1000)
				    .ease('linear')
					.attr("transform", function (d) {
						return 'translate('+projection([d.coordinates[1], d.coordinates[0]])[0]+','+projection([d.coordinates[1], d.coordinates[0]])[1]+')';
					});

			busesOnSvg
				.enter()
					.append('g')
						.attr("class", function(d) {
								return "vehicle_" + route.tag;
						})
						.attr("id", function(d) {
								return d.id;
						})
					.append("circle")
					  	.attr("class", "vehicle")
				    	.attr("cx", function(d) {
				        	return projection([d.coordinates[1], d.coordinates[0]])[0];
				        })
				        .attr("cy", function(d) {
				            return projection([d.coordinates[1], d.coordinates[0]])[1];
				        })
				    	.attr("r", 5)
				    	.attr("fill", "#" + function(d) { return d.color; })
				    .append("svg:title")
		          		.text(function(d) { return "Route: " + route.tag + ", Vehicle: " + d.id + ", Speed: " + d.speed + " km/h"});

			busesOnSvg
					.exit()
						.remove();

		}

	});
}



///////////////////////////////////////////////////////////


// This start the first steps. It compute the projection
// (basing on streets.json) and load the map
computeProjection(files[1], function(){
	loadMapElements(files[0], 1, loadNextbusInformation);
});


function obtainPaths(route, callback){
	var query = "http://webservices.nextbus.com/service/publicXMLFeed?command=routeConfig&a=sf-muni&r="+route.tag;
	console.log(query);
	d3.xml(query, function(error, data) {
		console.log("data:", data);
			d3.select(data)
			   .selectAll('route')
			   .each(function(){

					var route = d3.select(this);
					var tag   = route.attr('tag');

					// let's save the paths for the route...
					route
				    	.selectAll('path')
				        .each(function(){
							var coordinates = [];

				        	d3.select(this).selectAll('point').each(function(){
				            	var point = d3.select(this);
				            	coordinates.push([ +point.attr('lon'), +point.attr('lat'), 0]);
							});

							selectedPaths.push({type: 'Feature', properties: {color: route.attr('color'), routeTag: tag}, geometry: {type: 'LineString', coordinates: coordinates }});
						});
		});
		if(callback){
			callback();
		}
	});

}


function loadBusesInformation(route, next, lastTime, callback){
	var query = "http://webservices.nextbus.com/service/publicXMLFeed?command=vehicleLocations&a=sf-muni&r="+route.tag+"&t="+lastTime;
	console.log(query);
	console.log("...loading buses information...");
	d3.xml(query, function(error, data) {
		console.log(data)
				d3.select(data)
				   .selectAll('vehicle')
				   .each(function(){
						
					    var vehicle = d3.select(this);
					    var item =	{
					    				id			: vehicle.attr('id'),
					    				dirTag		: vehicle.attr('dirTag'),
					    				predictable : vehicle.attr('predictable'),
					    				speed 		: vehicle.attr('speedKmHr'),
										color		: routesColor[route.tag],
										coordinates : [vehicle.attr('lat'), vehicle.attr('lon')]
									};
						

						var list = vehiclesPerRoute[route.tag];
						if(list){
							vehiclesPerRoute[route.tag] = list.filter(function (e){ e.id !== item.id });
							vehiclesPerRoute[route.tag].push(item);
						}else{
							vehiclesPerRoute[route.tag] = [item];
						}
					});
			
			if(next >= selectedRoutes.length){
				if(callback){
					callback();
				}
			}else{
				var newLastTime = d3.select(data).select('lastTime').attr('time');
				loadBusesInformation(selectedRoutes[next], next+1, newLastTime, callback);
			}
	});
}
