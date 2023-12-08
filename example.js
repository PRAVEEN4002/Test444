import ColumnFilter from './column-filter.class';
import RangeDialogController from '../../view_models/vizpad/chartview/rangeDialogController';
import rangepicker from '../../view_models/vizpad/chartview/dateRangePickerModal.jade';
import angular from 'angular';
import _ from 'lodash';
import moment from 'moment';
import debounce from 'debounce-promise';

export class ColumnFilterController {
	/*@ngInject*/
	constructor(FilterService, DatasetStorageService, $mdDialog, TqlTransformationService, HelperFunctions, $timeout, $rootScope, ngDialog, $scope, BusinessViewService, $state) {
		this.FilterService         = FilterService;
		this.DatasetStorageService = DatasetStorageService;
		this.$mdDialog             = $mdDialog;
		this.TqlTransformationService = TqlTransformationService;
		this.HelperFunctions = HelperFunctions;
		this.columnFilterId     = _.uniqueId();
		this.condition          = null;
		this.selectedAction     = null;
		this.selectedMathAction = null;
		this.actions            = this.FilterService.getActions(this.isRowPolicy, this.columnType, true);
		this.actionParams       = [];
		this.mathActionParams   = [];
		this.mathActions        = this.FilterService.getMathActions();
		this.dimensionValueList = [];
		this.$timeout = $timeout;
		this.$rootScope = $rootScope;
		this.$scope = $scope;
		this.ngDialog = ngDialog;
		this.filteredValuesList = [];
		this.BusinessViewService = BusinessViewService;
		this.$state = $state;
	}
	$onInit() { 
		this.FilterService.on('FILTER_COLUMN_CHANGED', this.onFilterColumnchanged , this);
		this.FilterService.on('RESET_ADVANCED_FILTER', this.__resetAdvancedFilterHandler);
		if(!this.disableAutoComplete && this.columnName) {
			this.__getRequest(this.columnName);
		}
	}

	$onChanges(newProps) {
		if(!this.isRowPolicy){
			this.columnFilterId     = _.uniqueId();
			this.condition          = null;
			this.selectedAction     = null;
			this.selectedMathAction = null;
			this.actions            = this.FilterService.getActions(this.isRowPolicy, this.columnType, true);
			this.actionParams       = [];
			this.mathActionParams   = [];
			this.mathActions        = this.FilterService.getMathActions();
			this.dimensionValueList = [];
		}
		if(this.fromEditPipeline){
			this.selectedAction     = _.find(this.actions, action => {
				return _.get(action, 'name') && _.get(this,'filterObj.conditionName') && action.name.toLowerCase().indexOf(_.get(this,'filterObj.conditionName').toLowerCase()) > -1
			})
			if(_.get(this.selectedAction,'name')==="Inbetween"){
				this.actionParams = _.isArray(_.get(this,'filterObj.value')) ? _.get(this,'filterObj.value'):[_.get(this,'filterObj.value.low'),_.get(this,'filterObj.value.high')];
			}else{
				this.actionParams = this.dimensionValueList = _.isArray(_.get(this,'filterObj.value')) ? _.get(this,'filterObj.value'):[_.get(this,'filterObj.value')];
			}
			
			if(!this.filterObj && this.dateCondition){
				this.actionParams = []
				this.selectedAction     = _.find(this.actions, {name: _.get(this,'dateCondition.name')});
			}
		}
		if(_.get(this.dateCondition, 'starttime') && _.get(this.dateCondition, 'endtime') && this.columnName === _.get(this.dateCondition,'datecolumn')){
			this.showCustomDate = true;
			this.timeRange = {
				from: new Date(this.dateCondition.starttime),
				to: new Date(this.dateCondition.endtime),
				type: "customRange",
			}
			this.customDate = this.getCustomDate();
		}
		this.__isShowMathActions = false;
		try {
			if (!_.isUndefined(_.get(newProps, 'columnName.currentValue'))) {
				if (_.isUndefined(this.columnFilter) && _.isUndefined(_.get(newProps, 'state.currentValue'))) {
					const savedState = this.FilterService.getStateByColumnName({
						columnName: _.get(newProps, 'columnName.currentValue'),
						index: this.index,
					});

					if (!_.isEmpty(savedState.state)) {
						this.columnFilterId = savedState.state.columnFilterId;

						if (!_.isNull(_.get(savedState, 'state.state')) && !_.isNull(_.get(savedState,
								'state.state.selectedMathAction'))) {
							this.__isShowMathActions = true;
						}

						for (const i in _.get(savedState, 'state.state')) {
							if (savedState.state.state.hasOwnProperty(i)) {
								this[i] = savedState.state.state[i];
							}
						}
					}

					this.actions = this.FilterService.getActions(this.isRowPolicy, this.columnType, true);

					this.columnFilter = new ColumnFilter();

					this.columnFilter.setState({
						columnFilterId: this.columnFilterId,
						columnName: this.columnName,
						displayName : this.displayName,
						columnType: this.columnType,
						index: this.index,
						...savedState.state,
					});
					if(['In','Not in'].includes(_.get(savedState, 'state.state.selectedAction.name')) && _.get(savedState, 'state.state.actionParams')){
						this.dimensionValueList = _.get(savedState, 'state.state.actionParams[0]').split(',');
					}
					this.watchDestroy = this.$scope.$watch(() => {
						return this.selectedAction;
					}, (newVal, oldVal) => {
						if (!newVal || _.get(newVal,'name') === _.get(oldVal,'name')) return;
						this.dimensionValueList = [];
						this.actionParams = [];
						this.columnFilter.setState({
							columnFilterId: this.columnFilterId,
							columnName: this.columnName,
							columnType: this.columnType,
							displayName : this.displayName,
							index: this.index,
							state: { 
								...savedState.state,
								actionParams: [],
								selectedAction: this.selectedAction
							},
							
						});
					});
					this.onInit({
						filter: this.columnFilter,
					});
				} else {
					let {condition, value, field} = this.state;
					this.dimensionValueList = _.isArray(value) ? value.join(',') : value;
					if(this.filterActionsBasedOnCol && _.get(this.state, 'field.type') && _.get(this.state, 'field.typeStats.mainType')) {
						let colType = (_.get(this.state, 'field.type') === "dimension" && ["date", "timestamp"].indexOf(_.get(this.state, 'field.typeStats.mainType')) === -1) ? "string" : _.get(this.state, 'field.typeStats.mainType')
						this.actions = this.FilterService.getActions(this.isRowPolicy, colType, true);
					}
					const operators = _.map(this.actions, v => {
						return {
							operator: _.trim(_.replace(v.template('', '').replace("()",''), "''", '')),
							name: v.name,
						};
					});

					let action             = _.find(this.actions,
						{name: _.get(_.find(operators, {operator: condition}), 'name')});
					if(_.isUndefined(action)){
						action  = _.find(this.actions, {name: _.get(_.find(operators, {name: this.HelperFunctions.__getFilterConditionName(condition, this.HelperFunctions.getFormattedValue(value, this.isRowPolicy))}), 'name')});
					}
					if(this.isRowPolicy && !action){
						let filterString = field.name + " " + condition + " " + value;
						value  = ['between']   condition==='between'?value: value.replace(/%/g,"");
						action = _.find(this.actions, (action) => {
							let fs = action.template(field.name,value).replace(/'/g,"")
							return fs == filterString;
						})
					}

					if (!_.isUndefined(action)) {
						let modelId = _.get(this.selectedAction, '$$mdSelectId');
						_.forEach(this.actions, (act)=>{
							if(act.name == action.name){
								this.selectedAction = {
									name: act.name
								}
								if(modelId){
									this.selectedAction.$$mdSelectId = modelId;
								} 
							}
						});
						//const actionTmpl       = this.FilterService.getTemplateByName(_.get(this.selectedAction, 'name'));
						this.actionParamsCount = new Array(this.getActionParamsCount(this.selectedAction))
						this.actionParams      =  _.isObject(value) && condition==='between'?[_.get(value,'low'),_.get(value,'high')]: [value]
					}
				}

				if (!_.isUndefined(_.get(newProps, 'columnType'))) {
					this.actions = this.FilterService.getActions(this.isRowPolicy, newProps.columnType.currentValue, true);

					if (this.isDate() && this.custDateOptions) {
						let ar = [];
						for (let item in this.actions) {
							ar.push(this.actions[item]);
						}
						const dateRangeList = this.FilterService.getDateRangeList();
						this.actions        = _.union(dateRangeList, ar);
					}
				}
				this.asyncFunctionForDimensionValues = (searchString) => this.getDimensionSearchResults(searchString);
				this.asyncFunctionDebouncedForDimensionValues = debounce(this.asyncFunctionForDimensionValues,500)
			}	
		} catch (ex) {

		}
	}
	getCondition() {
		
	}

	isActionSelected(action) {
		const selectedAction = this.selectedAction;
		return !_.isNull(selectedAction) && _.get(selectedAction, 'name') === action.name;
	}
	onTextChange(){
		this.$timeout(()=>{
			if(this.isAdvListPopup && !this.isThreshold && this.filteredValuesList.length===0){
				if(this.filterValue[0] && !this.filterValue[1]){
					this.actionParams=[this.filterValue[0]]
				}
				if(this.filterValue[0] && this.filterValue[1]){
					this.actionParams=[this.filterValue[0],this.filterValue[1]]
				}
			}
		},1000);
		
	}

	$onDestroy() {
		// if (!_.isUndefined(this.columnName)
		// 	&& !_.isUndefined(this.columnFilter)) {
		// 	this.FilterService.setState({
		// 		columnFilterId: null,
		// 		columnName: this.columnName,
		// 		sourceId: this.DatasetStorageService.getCurrent(),
		// 		filter: this.columnFilter,
		// 		index: this.index,
		// 	});
		// }
		// this.watchDestroy();
		if(this.columnFilter){
			this.columnFilter.setState({});
		}
		this.FilterService.removeListener('FILTER_COLUMN_CHANGED', this.onFilterColumnchanged,this);
		this.FilterService.removeListener('RESET_ADVANCED_FILTER', this.__resetAdvancedFilterHandler, this);
	}

	toggleMathActions(event) {
		event.preventDefault();
		this.__isShowMathActions = !this.__isShowMathActions;

		if (this.__isShowMathActions === false) {
			this.selectedMathAction = null;
			this.mathActionParams   = [];
		}
	}

	isShowMath() {
		return this.__isShowMathActions && this.isNumber();
	}

	isNumber() {
		return ColumnFilter.isNumber({columnType: this.columnType});
	}

	onRangeChanges(range, parentThis){
		if(range.range.type != 'timeSlice'){
			parentThis.timeRange = {
				from: new Date(range.range.startDate),
				to: new Date(range.range.endDate),
				type: "customRange",
			}
		}
		if(_.get(range, 'range.action.subType') == "customRange"){
			range.range.action.type = "customRange"
		}
		if (!_.isUndefined(parentThis.columnFilter)) {
			parentThis.columnFilter.setState({
				columnFilterId: parentThis.columnFilterId,
				columnName: parentThis.columnName,
				displayName : parentThis.displayName,
				columnType: parentThis.columnType,
				sourceId: parentThis.DatasetStorageService.getCurrent(),
				index: parentThis.index,
				state: {
					actionParams: parentThis.actionParams,
					selectedAction: range.range.action,
					selectedMathAction: parentThis.selectedMathAction,
					mathActionParams: parentThis.mathActionParams,
					customDateOptions: parentThis.timeRange,
				},
			});
			if (!parentThis.isRowPolicy) {
				parentThis.FilterService.setState({
					columnFilterId: parentThis.columnFilterId,
					columnName: parentThis.columnName,
					displayName : parentThis.displayName,
					sourceId: parentThis.DatasetStorageService.getCurrent(),
					filter: parentThis.columnFilter,
					index: parentThis.index,
				});
			}
		}
		parentThis.checkTimeRange();
		parentThis.proceedWithFilter(true);
		this.closeThisDialog()
	}
	showRange(ev) {
		let parentThis        = this;
		parentThis.fromFilter = true;
		parentThis.timeRange  = {};
		let scope = this.$rootScope.$new();
		const hideTimeslice = ['app.analytics.explore.filters', 'ml.wizard.predict', 'app.ml.wizard.predict.filters'].indexOf(_.get(this, '$state.current.name')) > -1;
        Object.assign(scope, {
			parentThis: this,
			startDate: moment(_.get(this.dateCondition, 'starttime')),
			endDate: moment(_.get(this.dateCondition, 'endtime')),
			rangeOpened: true,
			showCancel: true,
			selectedDateColumn: parentThis.columnName,
			onRangeChanges: parentThis.onRangeChanges,
			hideRange: true,
			hideTimeslice: hideTimeslice
		});
		this.ngDialog.openConfirm({
			template: `<tellius-date-range hide-range="hideRange" start-date="startDate" end-date='endDate', format='DD-MM-YYYY' opened="rangeOpened" on-update="onRangeChanges({range}, parentThis)" show-cancel="showCancel" column="selectedDateColumn" hide-timeslice = "hideTimeslice">`,
			plain: true,
			className: 'ngdialog-theme-default date-range-popup',
			scope: scope
		})
	}

	checkTimeRange() {
		if (!this.timeRange.from || !this.timeRange.to) {
			this.timeRange      = undefined;
			if(_.get(this.columnFilter, 'state.state.selectedAction') && _.get(this.columnFilter, 'state.state.selectedAction.subType') == "timeSlice") {
				this.customDate = _.get(this.columnFilter, 'state.state.selectedAction.name');
				this.showCustomDate = true;
			} else{
				this.showCustomDate = false;
				this.selectedAction = {
					type: 'custom',
					name: 'Custom Range',
				};
			}
		} else {
			this.customDate     = this.getCustomDate();
			this.showCustomDate = true;
		}
	}

	getCustomDate() {
		return moment(_.get(this.timeRange, 'from')).format('DD MMM YYYY') + ' - ' + moment(_.get(this.timeRange, 'to')).format('DD MMM YYYY');
	}


	onChange(ev) {
		if (this.isDate() && (_.get(this.selectedAction,'type') === 'customRange' || _.get(this.selectedAction,'type') == 'custom')) {

			if(_.isUndefined(this.customDateOptions)) {
				this.showRange(ev);
			} else {
				this.timeRange = this.customDateOptions;
				this.checkTimeRange();
				this.proceedWithFilter();
			}
		} else {
			this.timeRange      = undefined;
			this.customDate     = undefined;
			this.customDateOptions = undefined;
			this.showCustomDate = false;
			this.proceedWithFilter();
		}

		if (!_.isUndefined(this.state)) {
			const operators = _.map(this.actions, v => {
				return {
					operator: v.name == 'Custom Range' ?  v.name : v.template ? _.trim(_.replace(v.template('', '').replace(/%/g,"").replace("()",''), "''", '')): v.name,
					name: v.name,
				};
			});
			let condition = _.get(_.find(operators, {name: _.get(this.selectedAction, 'name')}), 'operator');
			let value = (this.isDate() && _.get(this.selectedAction, 'name') == "Custom Range") ? _.get(this.selectedAction, 'name') : _.get(this.actionParams, "[0]");

			if(this.isRowPolicy && !(this.isDate() && _.get(this.selectedAction, 'name') == "Custom Range")){
				let obj = _.find(this.actions, {name: _.get(this.selectedAction, 'name')});
				if(_.get(obj, 'filterObj')){
					obj =   obj.filterObj(this.columnName,_.get(this.actionParams,"[0]"),_.get(this.actionParams,"[1]"))
					condition = obj[0].operator
					value = obj[0].value
				}
			}
			
			this.onChangeState({
				state: {
					id: this.state.id,
					value: value,
					condition,
					filterIndex : this.state.filterIndex
				},
			});
		}

		if (
			ColumnFilter.isNumber({columnType: this.columnType}) &&
			this.selectedMathAction) {
			const mathTmpl       = ColumnFilter.getTemplateByName(this.selectedMathAction);
			this.mathParamsCount = new Array(mathTmpl.length - 1);
		}

		this.onUpdateAction({selectedAction : this.selectedAction})
		
		if (_.isUndefined(this.columnFilter) || !_.get(this.selectedAction, 'name')) {
			return;
		}
	}
	getActionParamsCount(selectedAction){
		let arrLength = 0;
		if(_.get(selectedAction, 'name')){
			if(_.get(selectedAction, 'name') === "Inbetween"){
				arrLength = 2;
			} else {
				arrLength = 1;
			}
		}
		return arrLength;
	}
	isTwoInputs() { 
		return _.get(this, 'actionParamsCount.length')>1;
	}
	

	proceedWithFilter(isTimeSlice) {
		//const actionTmpl       = this.FilterService.getTemplateByName(_.get(this.selectedAction, 'name'));
		this.actionParamsCount = new Array(this.getActionParamsCount(this.selectedAction))
		if(this.showCustomDate){
			this.actionParamsCount = [];
		}
		if(this.disableAutoComplete && this.selectedAction && (_.get(this.selectedAction,'name') == 'In' || _.get(this.selectedAction,'name') == 'Not in')){
			this.actionParams = [this.dimensionValueList];
		}
		if(!this.disableAutoComplete && this.selectedAction && (_.get(this.selectedAction,'name') == 'In' || _.get(this.selectedAction,'name') == 'Not in')){
			this.actionParams =
			Array.isArray(this.dimensionValueList) && !_.isEmpty(this.dimensionValueList) ? [this.dimensionValueList.join(',')] : this.dimensionValueList;
		}

		if (!_.isUndefined(this.columnFilter)) {
			if(!isTimeSlice){
				this.columnFilter.setState({
					columnFilterId: this.columnFilterId,
					columnName: this.columnName,
					columnType: this.columnType,
					displayName : this.displayName,
					sourceId: this.DatasetStorageService.getCurrent(),
					index: this.index,
					state: {
						actionParams: this.actionParams,
						selectedAction: this.selectedAction,
						selectedMathAction: this.selectedMathAction,
						mathActionParams: this.mathActionParams,
						customDateOptions: this.timeRange,
					},
				});
			}
			if(!this.isRowPolicy){
				this.FilterService.setState({
					columnFilterId: this.columnFilterId,
					columnName: this.columnName,
					displayName : this.displayName,
					sourceId: this.DatasetStorageService.getCurrent(),
					filter: this.columnFilter,
					index: this.index,
				});
			}
		}

		this.onUpdate({
			filter: this.columnFilter,
		});
	}

	isShowCondition() {
		return this.columnFilter && this.columnFilter.getCondition() && this.showCondition;
	}

	isDate() {
		return ColumnFilter.isDate({columnType: this.columnType});
	}

	onFilterColumnchanged({filter, index}) {
		this.filter = filter;
		if (this.index !== index) return;
		if(filter.type == 'doubletype'){
			this.disableAutoComplete = true;
		}
		if(!this.disableAutoComplete && filter) {
			this.__getRequest(filter.name, _.get(filter, 'column.datasetId'));
		}
		this.actions = this.FilterService.getActions(this.isRowPolicy, filter.type, true);
		this.selectedAction = null;
		this.showCustomDate = false;
		this.customDate = null;
		if(_.get(this,'filterValue.length')){this.filterValue[index] = null}
		// if(_.get(this,'da.length')){this.date[index] = null}
	}
	__resetAdvancedFilterHandler(){
		if(this.resetonchange){
			this.customDate = undefined;
			this.showCustomDate = false;
		}
	}
	getDimensionSearchResults(searchString) {
		console.log(searchString,"sadasdas")
		const datasetId = this.DatasetStorageService.getRoot().datasetId;
		let req = {
			datasetId: datasetId,
			groupBy: this.columnName,
			offset: 0,
			orderBy: this.columnName,
			select: this.columnName,
		};
		if(_.includes(_.get(this,"$state.current.name"),"app.transform.grid" )){ 
			req.sourceId=this.DatasetStorageService.getCurrent()
		}
		if (_.isEmpty(req.where) || isEmpty(req.where.args)) {
			req.where = {
				operator: "and",
				negate: false,
				args: []
			};
		}
		req.where.args.push({
			"column": {
				"name": this.columnName
			},
			"condition": 'like',
			"value": "%"+searchString+"%"
		});
		return this.TqlTransformationService.getDataForFilterPane(req);
	}

	async searchInDimensionValues (searchString) {
		if(!searchString) {
			return this.valueList;
		}
		if(this.isTruncated){
			const searchDimResults =  await this.asyncFunctionDebouncedForDimensionValues(searchString).catch((err) => {
				console.log("ERR", {err});
				return [];
			});
			console.log("searchDim");
			const dmResults =  _.map(searchDimResults.rows, row => {
				return row[0] == null ? "Null" : _.toString(row[0])
			});
			this.filteredValuesList = angular.copy(dmResults);
			return dmResults;
		}else{
			let lowerSearchString = searchString.toLowerCase();
			let filteredValues = _.filter(this.valueList, dimValue => {
				if(dimValue.toLowerCase().indexOf(lowerSearchString) !== -1) {
					return dimValue;
				}
			});
			this.filteredValuesList = angular.copy(filteredValues);
			return filteredValues;
		}
	}
	__getRequest(filterColum, dsId) {
		let datasetId = dsId ? dsId : this.DatasetStorageService.getRoot().datasetId;
		if(!_.isUndefined(this.conditions, 'pipline.publishes') && !_.get(this.conditions, 'node.id')){
			let index = _.findIndex(this.conditions.pipline.publishes, f=>  (f.id == this.conditions.node.id))
			datasetId = index < 1 ? datasetId : _.get(this.conditions.pipline.publishes[index -1 ], 'id')
		}
		let req = {
			datasetId: datasetId,
			groupBy: filterColum,
			offset: 0,
			orderBy: filterColum,
			select: filterColum,
			businessViewId: this.BusinessViewService.getCurrent(),
		};
		
		if(_.includes(_.get(this,"$state.current.name"),"app.transform.grid" )){ 
			req.sourceId=this.DatasetStorageService.getCurrent()
		}
		this.TqlTransformationService.getDataForFilterPane(req, true).then(response => {
			this.isTruncated = _.get(response, 'isTruncated');
			this.valueList = _.map(response.rows, row => {
				return row[0] == null ? "Null" :row[0].toString();
			});
		});
	}

	showValue() {
		return !this.isThreshold && ((!this.disableAutoComplete) && (this.selectedAction && ['In', 'Not in', 'Starts with', 'Not starts with', 'Ends with', 'Not ends with','Does not contain', 'Contains', 'Matches regex','Blank', 'Not Blank'].indexOf(this.selectedAction.name) == -1)) && !this.isDate()
	}

	getValuesItem(str) {
		let isAnchorValid = /^\<a.*\>.*\<\/a\>/i.test(str);
		let value = str;
		if(str && _.isString(str) && !isAnchorValid && str.indexOf("</a>") > -1 && str.length > 7) {
			if(str[0] == str[str.length - 1] && str[0] == "'" || str[0] == '"') {
				isAnchorValid = /^\<a.*\>.*\<\/a\>/i.test(str.substring(1, str.length - 1));
				value = str.substring(1, str.length - 1);
				value = value.replaceAll("''", "'");
				value = value.replaceAll('""', '"');
				value = value.replaceAll('<a ', '<a target="_blank" '); // force target to blank to open in new tab
			}
		}
		if(isAnchorValid && value) {
			value = value.replace( /(<([^>]+)>)/ig, '');
		}
		return value;
	}
}
