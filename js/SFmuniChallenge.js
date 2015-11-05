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

// time window to update the vehicles information
var timeUpdate = 15000; // 15 sec

// variables for SF map elements
var files = ['./sfmaps/neighborhoods.json', './sfmaps/streets.json', './sfmaps/arteries.json', './sfmaps/freeways.json'];
var projection;
var path;

//	variable to keep the route colors and associate them to the buses too
var routesColor = {};

// All the sf-muni routes, loaded at the application startup, to load the buttons
var allRoutes = [];

/* 
	managing the paths and vehicles Lazy load 
*/
var vehiclesPerRoute = {};
var hiddenVehiclesPerRoute = {};

// Only the loaded routes, hidden and selected
var hiddenRoutes = [];
var selectedRoutes = [];

// Only the loaded paths, they corresponds to the routes, but they contain the information about the paths.
var hiddenPaths = [];
var selectedPaths = [];

// variable last time, to load only changed data from nextbus API
var lastTime = 0;

// indicate if there is a route request from a button and it is currently loading
var loading = false;
var routesLoading = []; // the routes that are currently loading because of a button

/************************************/
/* Compute and visualize the SF map */
/************************************/

// Function for computing projection basing on a geoJson
function computeProjection(fileJson, callback){
	d3.json(fileJson, function(geoJSON){

		var center = d3.geo.centroid(geoJSON);
		var scaleFactor  = 150;
		var scFactCorrection = 1.3;
		var offset = [width/2, height/2];
		projection = d3.geo.mercator().scale(scaleFactor*scFactCorrection).center(center)
		    .translate(offset);

		// create the path
		path = d3.geo.path().projection(projection);

		// using the path determine the bounds of the current map and use 
		// these to determine better values for the scale and translation
		var bounds  = path.bounds(geoJSON);

		var hscale  = scaleFactor*width  / ((bounds[1][0] - bounds[0][0]));
		var vscale  = scaleFactor*height / (bounds[1][1] - bounds[0][1]);
		scaleFactor   = (hscale < vscale) ? hscale : vscale;
		offset  = [width - (bounds[0][0] + bounds[1][0])/2,
		             height - (bounds[0][1] + bounds[1][1])/2];

		// new projection
		projection = d3.geo.mercator().center(center)
			.scale(scaleFactor).translate(offset);
		
		// new path
		path = path.projection(projection);
		
		if(callback){
			callback();	
		}
  });
}


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
function loadRoutesAndCreateButtons(){
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
        var newButton= $('<input type="button" id="button_'+route.tag+'" value="'+route.tag+'" class="btn btn-default btnRoute"/>');
        newButton.on('click', function(){ 
        	if(newButton.hasClass("btn-default")){
        		newButton.removeClass("btn-default")
        				 .addClass("btn-warning disabled hadDefault");
        		addRouteAndUpdate(route);
        	}else{
        		newButton.removeClass("btn-success")
        				 .addClass("btn-warning disabled hadSuccess");
        		removeRouteAndUpdate(route);
        	}
			loading = true;
        	routesLoading.push(route);
        });
		$("#busesButtons").append(newButton);
    });
}

// This starts the first steps. It computes the projection
// (basing on streets.json) and loads the map
computeProjection(files[1], function(){
	loadMapElements(files[0], 1, loadRoutesAndCreateButtons);
});


// Handy function for searching an object in an array through the value of a property
function arrayObjectIndexOf(myArray, property, searchTerm) {
    for(var i = 0; i < myArray.length; i++) {
        if (myArray[i][property] === searchTerm) return i;
    }
    return -1;
}

// When the user clicks on a button, we add the route in the list of routes, and update the svg
// We check if the route was loaded before and, in case, we just move the path to the visible array
// without reloading it through an API call
function addRouteAndUpdate(route){
	var index = arrayObjectIndexOf(hiddenRoutes, 'tag', route.tag);
	// If it is a new route, then load the info about it
	selectedRoutes.push(route);
	if(index === -1){
		//load the pathOfTheRoute
		obtainPaths(route, updateSvg);
	}else{
		// it is an already loaded route but hidden
		hiddenRoutes.splice(index,1);
		moveHiddensToSelected(route, updateSvg);
	}
}

// In case the user clicks on for hiding a route, we just move that route to
// the array of the hidden routes
function removeRouteAndUpdate(route){
	var index = arrayObjectIndexOf(selectedRoutes, 'tag', route.tag);
	selectedRoutes.splice(index,1);
	hiddenRoutes.push(route);
	
	moveSelectedsToHidden(route, updateSvg);
}

function moveHiddensToSelected(route, callback){
	selectedPaths = selectedPaths.concat(
		hiddenPaths.filter(function (item){
			return item.properties.routeTag === route.tag;
		})
	);

	hiddenPaths = hiddenPaths.filter(function (item){
					return item.properties.routeTag !== route.tag;
				  });

	vehiclesPerRoute[route.tag] = hiddenVehiclesPerRoute[route.tag];
	hiddenVehiclesPerRoute[route.tag] = [];

	if(callback){
		callback();
	}

}

function moveSelectedsToHidden(route, callback){
	hiddenPaths = hiddenPaths.concat(
		selectedPaths.filter(function(item){
			return item.properties.routeTag === route.tag;
		})
	);

	selectedPaths = selectedPaths.filter(function(item){
					return item.properties.routeTag !== route.tag;
				  });

	hiddenVehiclesPerRoute[route.tag] = vehiclesPerRoute[route.tag];
	vehiclesPerRoute[route.tag] = [];
	
	if(callback){
		callback();
	}

}

////// Update svg with data stored inside the global variables.
////// updateSvg can be launched after that the arrays of vehicles and paths are updated.
function updateSvg(){
	drawPaths();
	loadBusesInformation(selectedRoutes[0] || [], 1, selectedRoutes, drawBuses);
}	

// drawPaths has to do two steps:
//  1. add new paths, if any
//  2. remove paths that are not on the maps anymore (or that are to hide because of a user request)
function drawPaths(){
	var pathsToDraw = [];

	var pathsOnSvg = svg.select('g.paths')
						.selectAll('.routePath')
						.data(selectedPaths, function (d){ return d.id; });

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

		var busesOnSvg = svg.select('g.vehicles')
							.selectAll('.vehicle_'+route.tag)
							.data(vehiclesPerRoute[route.tag], function(d){return d.id});

		busesOnSvg
				.select('circle.vehicle')
				  	.transition()
				    .duration(timeUpdate)
				    .ease('linear')
					.attr("cx", function (d) {
						return projection([d.coordinates[0], d.coordinates[1]])[0];
					})
					.attr("cy", function (d){
						return projection([d.coordinates[0], d.coordinates[1]])[1];
					});

		busesOnSvg
			.enter()
				.append('g')
					.attr("class", function (d) {
							return "vehicle_" + route.tag;
					})
					.attr("id", function (d) {
							return d.id;
					})
					.append("circle")
					  	.attr("class", "vehicle")
				    	.attr("cx", function (d) {
				        	return projection([d.coordinates[0], d.coordinates[1]])[0];
				        })
				        .attr("cy", function (d) {
				            return projection([d.coordinates[0], d.coordinates[1]])[1];
				        })
						.attr("r", 6)
						.attr("fill", function (d) {
							return '#'+d.color || '#EEEEEE'; 
				    	})
				    	.on("click", function(d) {
				    		// on click, show info about the vehicle
				    		prepareAndShowTooltip(d, 
				    					'<p><strong>Route: </strong>'+ route.tag +'</p>' +
										'<p><strong>Vehicle: </strong>'+ d.id +'</p>' +
										'<p><strong>Speed: </strong>'+ d.speed +' Km/h</p>'
				    		);

						})
						.on('mouseout', function (d){
							setTimeout(hideTooltip, 750);
						})
						.append('svg:title')
							.text(function (d) {
								// when hovering a vehicle, show the route tag name
								return route.tag;
						});

		busesOnSvg
				.exit()
					.remove();

	});

	hiddenRoutes.forEach(function (hiddenRoute){
		//remove the buses of hidden paths
		svg.select('g.vehicles')
			.selectAll('.vehicle_'+hiddenRoute.tag)
				.remove();
	});

	if(loading){
		routesLoading.forEach(function (route){
			var btn = $('#button_'+route.tag);
			btn.removeClass("btn-warning disabled");
			if(btn.hasClass("hadDefault")){
				btn.removeClass("hadDefault")
				   .addClass("btn-success");
			}else{
				btn.removeClass("hadSuccess")
				   .addClass("btn-default");
			}
		});
		loading = false;
		routesLoading = [];
	}

}

function obtainPaths(route, callback){
	var query = "http://webservices.nextbus.com/service/publicXMLFeed?command=routeConfig&a=sf-muni&r="+route.tag;
	d3.xml(query, function(error, data) {
			d3.select(data)
			   .selectAll('route')
			   .each(function(){

					var route = d3.select(this);
					var tag   = route.attr('tag');
					routesColor[tag] = route.attr('color');

					var idPath = 1;
					// let's save the paths for the route...
					route
				    	.selectAll('path')
				        .each(function(){
							var coordinates = [];

				        	d3.select(this).selectAll('point').each(function(){
				            	var point = d3.select(this);
				            	coordinates.push([ +point.attr('lon'), +point.attr('lat'), 0]);
							});

							selectedPaths.push({type: 'Feature', id:tag+'-'+idPath++, properties: {color: route.attr('color'), routeTag: tag}, geometry: {type: 'LineString', coordinates: coordinates }});
						});
		});

		loadBusesInformation(route, null, null, callback);

	});

}

function loadBusesInformation(route, next, routes, callback){
	var query = "http://webservices.nextbus.com/service/publicXMLFeed?command=vehicleLocations&a=sf-muni&r="+route.tag+"&t="+lastTime;

	d3.xml(query, function(error, data) {
		vehiclesPerRoute[route.tag] = vehiclesPerRoute[route.tag] || [];
		hiddenVehiclesPerRoute[route.tag] = hiddenVehiclesPerRoute[route.tag] || [];

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
								coordinates : [vehicle.attr('lon'), vehicle.attr('lat')]
							};
				
				if(arrayObjectIndexOf(selectedRoutes, 'tag', route.tag) >= 0){
					vehiclesPerRoute[route.tag] = vehiclesPerRoute[route.tag].filter(function (e){ return e.id !== item.id; });
					vehiclesPerRoute[route.tag].push(item);
				}else{
					hiddenVehiclesPerRoute[route.tag] = hiddenVehiclesPerRoute[route.tag].filter(function (e){ return e.id !== item.id; });
					hiddenVehiclesPerRoute[route.tag].push(item);
				}
				
			});
			
		lastTime = d3.select(data).select('lastTime').attr('time');
			
		if(next){
			if(next >= routes.length){
				if(callback){
					callback();
				}
			}else{
				loadBusesInformation(routes[next], next+1, routes, callback);
			}				
		}else{
			if(callback){
				callback();
			}
		}
		
	});
}

/*************************/
/*     Tooltip Stuff     */
/*************************/
// Define 'div' for tooltips
var div = d3.select("body")
	.append("div")  // declare the tooltip div 
	.attr("class", "tooltip") // apply the 'tooltip' class
	.style("opacity", 0); // set the opacity to nil


d3.select('svg').on('click', function(d) {
	hideTooltip();
});


function prepareAndShowTooltip(d, message){
	div.transition()
		.duration(500)	
		.style("opacity", 0);
	div.transition()
		.duration(200)	
		.style("opacity", .9);	
	div	.html(message)
		.style("left", (d3.event.pageX) + "px")			 
		.style("top", (d3.event.pageY - 28) + "px");

	d3.event.stopPropagation();
}

function hideTooltip(){
	div.transition().duration(500).style('opacity', 0);
}







// Every 15 seconds, update the vehicles information...
function loadInfo(time_win){
	var routesToLoad = selectedRoutes.concat(hiddenRoutes);
	if(routesToLoad[0]){
		loadBusesInformation(routesToLoad[0], 1, routesToLoad, updateSvg);
	}
	setTimeout(function(){loadInfo(time_win) }, time_win);
}

loadInfo(timeUpdate);