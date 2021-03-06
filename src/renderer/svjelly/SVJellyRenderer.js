var Commands = require('../../core/Commands');
var ARC = Commands.ARC;
var LINE_TO = Commands.LINE_TO;
var MOVE_TO = Commands.MOVE_TO;
var BEZIER_TO = Commands.BEZIER_TO;
var QUADRA_TO = Commands.QUADRA_TO;
var ELLIPSE = Commands.ELLIPSE;
var SVJellyUtils = require('../../core/SVJellyUtils');

var SVJellyRenderer =//function ($world, $canvas)
{
	create: function ($world, $container)
	{
		var inst = Object.create(SVJellyRenderer);

		inst.container = inst.mainCanvas = $container;
		inst.world = $world;
		inst.multiCanvas = $world.conf.multiCanvas;
		if (inst.multicanvas) { inst.mainContext = inst.mainCanvas.getContext('2d'); }
		inst.debug = $world.conf.debug;

		//inst.setSize($width, $height);

		if (!inst.multiCanvas) { inst.container = inst.mainCanvas; }

		return inst;
	},

	setSize: function ($width, $height)
	{
		while (this.container.firstChild)
		{
			this.container.removeChild(this.container.firstChild);
		}

		this.staticCanvas = [];
		this.dynamicCanvas = [];
		this.cachedHard = [];
		this.dynamicGroups = [];
		this.dynamicGroupsLength = undefined;

		this.width = $width;
		this.height = $height;

		this.scaleX = this.scaleY = this.width / this.world.getWidth();

		this.drawingGroups = [];
		var k = 0;
		var i;
		for (var groupsLength = this.world.groups.length; k < groupsLength; k += 1)
		{
			var currGroup = this.world.groups[k];
			this.createDrawingGroup(currGroup);
		}
		this.drawingGroupsLength = this.drawingGroups.length;

		var drawingGroup;

		//caching non moving groups
		i = 0;
		var canvas;
		var context;
		for (i; i < this.drawingGroupsLength; i += 1)
		{
			drawingGroup = this.drawingGroups[i];
			if (drawingGroup.isStatic)
			{
				//if some static layers are on top of each other, no need to create
				//a new canvas, you can just draw the layers on the same one
				canvas = this.staticCanvas[i - 1] || this.createCanvas();
				context = canvas.getContext('2d');
				this.staticCanvas[i] = canvas;
			}
			else
			{
				canvas = this.dynamicCanvas[i - 1] || this.createCanvas();
				context = canvas.getContext('2d');
				this.dynamicCanvas[i] = canvas;
				this.dynamicGroups.push(drawingGroup);
			}
			drawingGroup.canvas = canvas;
			drawingGroup.context = context;
		}
		this.dynamicGroupsLength = this.dynamicGroups.length;
		//

		//caching gradients and precalculating
		for (i = 0; i < this.drawingGroupsLength; i += 1)
		{
			drawingGroup = this.drawingGroups[i];
			//precalculating some thisructions
			drawingGroup.properties.lineWidth = drawingGroup.properties.lineWidth * this.scaleX;
			drawingGroup.properties.radiusX = drawingGroup.properties.radiusX * this.scaleX;
			drawingGroup.properties.radiusY = drawingGroup.properties.radiusY * this.scaleY;
			var nodesLength = drawingGroup.nodes.length;
			for (k = 0; k < nodesLength; k += 1)
			{
				var currNode = drawingGroup.nodes[k];
				var command = currNode.drawing.command;
				var options = currNode.drawing.options;
				if (drawingGroup.isSimpleDrawing && (command === BEZIER_TO || command === QUADRA_TO))
				{
					currNode.drawing.command = LINE_TO;
				}
				if (drawingGroup.isSimpleDrawing && (command === ELLIPSE))
				{
					currNode.drawing.command = ARC;
				}
				//precalculationg control points and radix;
				if (command === BEZIER_TO || command === QUADRA_TO)
				{
					for (var m = 0, length = options.length; m < length; m += 1)
					{
						var currOption = options[m];
						currOption[0] = currOption[0] * this.scaleX;
						currOption[1] = currOption[1] * this.scaleY;
					}
				}
				else if (command === ELLIPSE || command === ARC)
				{
					options[0] = options[0] * this.scaleX;
					options[1] = options[1] * this.scaleX;
				}
			}
			drawingGroup.nodesLength = drawingGroup.nodes.length;
			//
			if (drawingGroup.properties.strokeGradient)
			{
				drawingGroup.properties.stroke = this.createGradient(drawingGroup.context, drawingGroup.properties.strokeGradient);
			}
			if (drawingGroup.properties.fillGradient)
			{
				drawingGroup.properties.fill = this.createGradient(drawingGroup.context, drawingGroup.properties.fillGradient);
			}
		}

		// multi canvas
		if (this.multiCanvas)
		{
			//this.container = document.createElement('div');
			//this.container = this.container;
			//this.container.id = this.mainCanvas.id;
			this.container.style.position = 'relative';
			//this.container.className = this.mainCanvas.className;
			//this.mainCanvas.parentNode.replaceChild(this.container, this.mainCanvas);

			for (i = 0; i < this.drawingGroupsLength; i += 1)
			{
				drawingGroup = this.drawingGroups[i];
				this.addLayer(this.container, drawingGroup.canvas, !drawingGroup.isStatic);
				// if (!container.contains(drawingGroup.canvas)) { container.appendChild(drawingGroup.canvas); }
			}
		}
		this.draw = this.multiCanvas ? this.drawMultiCanvas : this.drawSingleCanvas;
		//

		//drawingGroups once
		for (i = 0; i < this.drawingGroupsLength; i += 1)
		{
			drawingGroup = this.drawingGroups[i];
			this.drawGroup(drawingGroup, drawingGroup.context);
		}

		if (this.debug)
		{
			this.debugCanvas = this.createCanvas();
			this.debugContext = this.debugCanvas.getContext('2d');
			this.addLayer(this.multiCanvas ? this.container : this.mainCanvas.parentNode, this.debugCanvas, false);
		}

		//caching hard stuff - not interesting performance-wise yet
		// for (i = 0; i < this.drawingGroupsLength; i += 1)
		// {
		// 	drawingGroup = this.drawingGroups[i];
		// 	if (drawingGroup.bodyType === 'hard' && !drawingGroup.fixed)
		// 	{
		// 		canvas = this.createCanvas();
		// 		this.drawGroup(drawingGroup, canvas.getContext('2d'));
		// 		this.cachedHard[i] = canvas;
		// 	}
		// }
	},

	addLayer: function ($parent, $canvas, $pointerEvents)
	{
		if ($parent.contains($canvas)) { return; }
		$parent.appendChild($canvas);
		$canvas.style.position = 'absolute';
		// $canvas.style.top = this.mainCanvas.offsetTop + 'px';
		// $canvas.style.left = this.mainCanvas.offsetLeft + 'px';
		$canvas.style.pointerEvents = $pointerEvents ? 'auto' : 'none';
	},
	createCanvas: function ()
	{
		var canvas = window.document.createElement('canvas');
		canvas.width = this.width;
		canvas.height = this.height;
		return canvas;
	},

	createGradient: function ($context, $properties)
	{
		var x1 = $properties.x1 * this.scaleX;
		var y1 = $properties.y1 * this.scaleY;
		var x2 = $properties.x2 * this.scaleX;
		var y2 = $properties.y2 * this.scaleY;

		var cx = $properties.cx * this.scaleX;
		var cy = $properties.cy * this.scaleY;
		var fx = $properties.fx * this.scaleX || cx;
		var fy = $properties.fy * this.scaleY || cy;
		var r = $properties.r * this.scaleX;

		var gradient = $properties.type === 'linearGradient' ? $context.createLinearGradient(x1, y1, x2, y2) : $context.createRadialGradient(cx, cy, 0, fx, fy, r);

		for (var stopN = 0, stopLength = $properties.stops.length; stopN < stopLength; stopN += 1)
		{
			gradient.addColorStop($properties.stops[stopN].offset, $properties.stops[stopN].color);
		}

		return gradient;
	},

	createDrawingGroup: function ($group)
	{
		var drawingGroup;
		if ($group.drawing.opacity === 0) { return; }

		for (var i = 0, length = this.world.groups.length; i < length; i += 1)
		{
			var currGroup = this.world.groups[i];
			if (!currGroup.drawingGroup) { continue; }
			if (this.compareProperties(currGroup.drawingGroup.properties, $group.drawing.properties) &&
				this.willNotIntersect(currGroup, $group) &&
				this.isStatic($group) === false &&
				this.isSimpleDrawing($group) === this.isSimpleDrawing(currGroup) &&
				$group.drawing.opacity === 1)
			{
				drawingGroup = $group.drawingGroup = currGroup.drawingGroup;
			}
		}
		if (!drawingGroup)
		{
			drawingGroup =
			{
				properties: SVJellyUtils.extend({}, $group.drawing.properties),
				isStatic: this.isStatic($group),
				isSimpleDrawing: this.isSimpleDrawing($group),
				nodes: []
			};
			$group.drawingGroup = drawingGroup;
			this.drawingGroups.push(drawingGroup);
		}
		drawingGroup.nodes = drawingGroup.nodes.concat($group.drawing.nodes);
		return drawingGroup;
	},

	isStatic: function ($group)
	{
		return $group.conf.fixed === true;
	},

	getCollisionGroup: function ($group)
	{
		return $group.conf.physics.bodyType;
	},

	willNotIntersect: function ($groupA, $groupB)
	{
		if ($groupA.conf.physics.bodyType === 'hard' || $groupB.conf.physics.bodyType === 'hard')
		{
			return false;
		}
		return true;
	},
	isSimpleDrawing: function ($group)
	{
		if ($group.conf.physics.bodyType === 'hard' || $group.conf.physics.bodyType === 'soft')
		{
			return true;
		}
		return false;
	},

	compareProperties: function ($one, $two)
	{
		var comparison = true;
		for (var name in $two)
		{
			if ($one[name] !== $two[name]) { comparison = false; }
		}
		return comparison;
	},

	drawMultiCanvas: function ()
	{
		//this.mainContext.clearRect(0, 0, this.width, this.height);
		var previous;
		for (var i = 0; i < this.dynamicGroupsLength; i += 1)
		{
			var drawingGroup = this.dynamicGroups[i];
			if (previous !== drawingGroup.context) { drawingGroup.context.clearRect(0, 0, this.width, this.height); }
			previous = drawingGroup.context;
			this.drawGroup(drawingGroup, drawingGroup.context);
		}

		if (this.debug) { this.debugDraw(true); }
	},

	drawSingleCanvas: function ()
	{
		this.mainContext.clearRect(0, 0, this.width, this.height);
		//this.context.miterLimit = 1;
		var previousCached;
		for (var i = 0; i < this.drawingGroupsLength; i += 1)
		{
			var drawingGroup = this.drawingGroups[i];
			if (this.staticCanvas[i])
			{
				if (this.staticCanvas[i] === previousCached) { continue; }
				this.mainContext.drawImage(this.staticCanvas[i], 0, 0);
				previousCached = this.staticCanvas[i];
			}
			else
			{
				this.drawGroup(drawingGroup, this.mainContext);
			}
		}

		if (this.debug) { this.debugDraw(true); }
	},

	drawGroup: function (drawing, context)
	{
		context.beginPath();

		if (context.fillStyle !== drawing.properties.fill) { context.fillStyle = drawing.properties.fill; }
		if (context.strokeStyle !== drawing.properties.stroke) { context.strokeStyle = drawing.properties.stroke; }
		if (context.lineWidth !== drawing.properties.lineWidth) { context.lineWidth = drawing.properties.lineWidth; }
		if (context.lineCap !== drawing.properties.lineCap) { context.lineCap = drawing.properties.lineCap; }
		if (context.lineJoin !== drawing.properties.lineJoin) { context.lineJoin = drawing.properties.lineJoin; }
		if (context.globalAlpha !== drawing.properties.opacity) { context.globalAlpha = drawing.properties.opacity; }

		for (var k = 0; k < drawing.nodesLength; k += 1)
		{
			var currNode = drawing.nodes[k];

			if (currNode.drawing.command === MOVE_TO)
			{
				context.moveTo(currNode.getX() * this.scaleX, currNode.getY() * this.scaleY);

				//special case for lines with nice dynamic gradients
				if (drawing.properties.dynamicGradient)
				{
					var x1 = currNode.getX() * this.scaleX;
					var y1 = currNode.getY() * this.scaleY;
					var x2 = currNode.drawing.endNode.getX() * this.scaleX;
					var y2 = currNode.drawing.endNode.getY() * this.scaleY;
					var gradient = context.createLinearGradient(x1, y1, x2, y2);
					for (var stopN = 0, stopLength = drawing.properties.strokeGradient.stops.length; stopN < stopLength; stopN += 1)
					{
						gradient.addColorStop(1 - drawing.properties.strokeGradient.stops[stopN].offset, drawing.properties.strokeGradient.stops[stopN].color);
					}
					context.strokeStyle = gradient;
				}
				//
			}
			else if (currNode.drawing.command === LINE_TO)
			{
				context.lineTo(currNode.getX() * this.scaleX, currNode.getY() * this.scaleY);
				continue;
			}
			else if (currNode.drawing.command === ARC)
			{
				context.moveTo(currNode.getX() * this.scaleX + currNode.drawing.options[0], currNode.getY() * this.scaleY);
				context.arc(currNode.getX() * this.scaleX, currNode.getY() * this.scaleY, currNode.drawing.options[0], 0, Math.PI * 2);
			}
			if (!drawing.isSimpleDrawing)
			{
				var options = currNode.drawing.options;
				var baseX = currNode.getX() * this.scaleX;
				var baseY = currNode.getY() * this.scaleY;
				var cp1x;
				var cp1y;

				if (currNode.drawing.command === BEZIER_TO || currNode.drawing.command === QUADRA_TO)
				{
					cp1x = baseX + options[0][0];
					cp1y = baseY + options[0][1];
				}

				if (currNode.drawing.command === BEZIER_TO)
				{
					var cp2x = baseX + options[1][0];
					var cp2y = baseY + options[1][1];
					context.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, baseX, baseY);
					//context.lineTo(baseX, baseY);
				}
				else if (currNode.drawing.command === QUADRA_TO)
				{
					context.quadraticCurveTo(cp1x, cp1y, baseX, baseY);
				}
				else if (currNode.drawing.command === ELLIPSE)
				{
					context.moveTo(currNode.getX() * this.scaleX, currNode.getY() * this.scaleY);
					context.ellipse(currNode.getX() * this.scaleX, currNode.getY() * this.scaleY, currNode.drawing.options[0], currNode.drawing.options[1], currNode.drawing.options[2], 0, Math.PI * 2);
				}
			}
		}

		if (drawing.properties.closePath) { context.closePath(); }
		if (drawing.properties.fill !== 'none') { context.fill(); }
		if (drawing.properties.stroke !== 'none') { context.stroke(); }
		if (drawing.properties.opacity !== 1) { context.globalAlpha = 1; }
	},

	debugDraw: function ($clear)
	{
		if ($clear !== undefined) { this.debugContext.clearRect(0, 0, this.width, this.height); }

		this.debugContext.strokeStyle = 'yellow';
		this.debugContext.lineCap = 'butt';
		this.debugContext.lineJoin = 'miter';
		this.debugContext.lineWidth = 1;
		this.debugContext.beginPath();
		var currGroup;
		var i;
		var k;
		var groupsLength = this.world.groups.length;
		var nodesLength;
		for (k = 0; k < groupsLength; k += 1)
		{
			currGroup = this.world.groups[k];

			nodesLength = currGroup.nodes.length;
			for (i = 0; i < nodesLength; i += 1)
			{
				var currNode = currGroup.nodes[i];
				var xPos = currNode.getX() * this.scaleX;
				var yPos = currNode.getY() * this.scaleY;
				var radius = currNode.physicsManager.radius || currGroup.structure.radiusX || 0.01;
				radius *= this.scaleX;
				radius = Math.max(radius, 1);
				// console.log(currGroup.structure.innerRadius, currGroup.conf.nodeRadius, currGroup.structure.radiusX);
				// console.log(radius);
				// debugger;
				this.debugContext.moveTo(xPos + radius, yPos);
				this.debugContext.arc(xPos, yPos, radius, 0, Math.PI * 2);
				if (currNode.physicsManager.body)
				{
					this.debugContext.moveTo(xPos, yPos);
					var angle = currNode.physicsManager.body.angle;
					this.debugContext.lineTo(xPos + Math.cos(angle) * radius, yPos + Math.sin(angle) * radius);
				}
			}
		}
		this.debugContext.stroke();

		this.debugContext.strokeStyle = 'rgba(255,1,1,1)';
		this.debugContext.beginPath();
		for (k = 0; k < groupsLength; k += 1)
		{
			currGroup = this.world.groups[k];
			var jointsLength = currGroup.joints.length;

			for (i = 0; i < jointsLength; i += 1)
			{
				var currJoint = currGroup.joints[i];
				this.debugContext.moveTo(currJoint.nodeA.getX() * this.scaleX, currJoint.nodeA.getY() * this.scaleY);
				this.debugContext.lineTo(currJoint.nodeB.getX() * this.scaleX, currJoint.nodeB.getY() * this.scaleY);
			}
		}
		this.debugContext.stroke();

		this.debugContext.strokeStyle = 'blue';
		this.debugContext.beginPath();
		var length = this.world.groupConstraints.length;
		for (k = 0; k < length; k += 1)
		{
			var currLock = this.world.groupConstraints[k];
			this.debugContext.moveTo(currLock.anchorA.getX() * this.scaleX, currLock.anchorA.getY() * this.scaleY);
			this.debugContext.lineTo(currLock.anchorB.getX() * this.scaleX, currLock.anchorB.getY() * this.scaleY);
		}
		this.debugContext.stroke();

		this.debugContext.fillStyle = 'black';
		for (k = 0; k < groupsLength; k += 1)
		{
			var group = this.world.groups[k];
			nodesLength = group.nodes.length;
			for (i = 0; i < nodesLength; i += 1)
			{
				var node = group.nodes[i];
				if (node.debugText) { this.debugContext.fillText(node.debugText, node.getX() * this.scaleX, node.getY() * this.scaleY); }
			}
		}
	}
};

module.exports = SVJellyRenderer;

